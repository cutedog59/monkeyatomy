// ==UserScript==
// @name         tw-atomy-autofill
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自動填寫 Atomy 訂單資料、付款資訊與同意操作（優化執行核心，提升流暢度）
// @author       zihzih
// @match        https://tw.atomy.com/*
// @match        https://sslpayment.uwccb.com.tw/EPOSService/Payment/OrderInitial.aspx
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    // ----------------------------
    // 檔案（Profile）設定
    // ----------------------------
    const PROFILES = {
        a1: {
            key: 'a1',
            label: '小王',
            recipient: '小王',
            phone: '0911222333',
            targetInputValue: '',
            login: { id: '', pw: '' },
            creditCards: [
                { number: '1111222233334444', month: '01', year: '2011', cvv: '111', fillDelay: 100 },
                { number: '1111222233334444', month: '01', year: '2011', cvv: '111', fillDelay: 100 }
            ]
        },
        a2: {
            key: 'a2',
            label: '小王',
            recipient: '小王',
            phone: '0911222333',
            targetInputValue: '',
            login: { id: '', pw: '' },
            creditCards: [
                { number: '1111222233334444', month: '01', year: '2011', cvv: '111', fillDelay: 100 },
                { number: '1111222233334444', month: '01', year: '2011', cvv: '111', fillDelay: 100 }
            ]
        },
        a3: {
            key: 'a3',
            label: '小王',
            recipient: '小王',
            phone: '0911222333',
            targetInputValue: '',
            login: { id: '', pw: '' },
            creditCards: [
                { number: '1111222233334444', month: '01', year: '2011', cvv: '111', fillDelay: 100 },
                { number: '1111222233334444', month: '01', year: '2011', cvv: '111', fillDelay: 100 }
            ]
        },
        a4: {
            key: 'a4',
            label: '小王',
            recipient: '小王',
            phone: '0911222333',
            targetInputValue: '',
            login: { id: '', pw: '' },
            creditCards: [
                { number: '1111222233334444', month: '01', year: '2011', cvv: '111', fillDelay: 100 },
                { number: '1111222233334444', month: '01', year: '2011', cvv: '111', fillDelay: 100 }
            ]
        }
    };

    // 目前使用中的檔案
    let activeProfileKey = GM_getValue('zihzih_activeProfile', 'zi');
    let activeProfile = PROFILES[activeProfileKey];

    // 是否自動結帳（E 工作）
    let autoCheckoutEnabled = GM_getValue('zihzih_autoCheckout', true);
    // 是否自動點擊配送（A 工作）
    let autoDeliveryEnabled = GM_getValue('zihzih_autoDelivery', true);

    // ----------------------------
    // 選擇器與配置
    // ----------------------------
    const CONFIG = {
        elementTimeout: 5000,
        clickDelay: 0, // 移除不必要的延遲，改為即時
        selectors: {
            deliveryButtonXPath: '//*[@id="odr_dlvp_goods_info"]/div[2]/div[2]/button[2]',
            recipientField: '#center-txt_0',
            phoneField: '#center-phone',
            targetCheckboxXPath: '//*[@id="tgLyr_8"]/div/div/div[3]/ul/li[2]/div[1]/div[1]/label',
            targetInputXPath: '//*[@id="tgLyr_8"]/div/div/div[3]/ul/li[2]/div[2]/input',
            agreementCheckInputXPath: '//*[contains(@id, "fxd-agr_ck_") and @type="checkbox"]',
            agreementCheckLabelXPath: '//*[contains(@terms-role, "terms-label-") or contains(text(), "隱私權政策")]',
            paymentOptionXPath: '//*[contains(@class, "mth-reuse")]/span/label | //label[contains(text(), "信用卡") or contains(text(), "Credit Card")]',
            creditCard: {
                number: '#ctl00_ContentPlaceHolder1_strCardNo',
                month: '#ctl00_ContentPlaceHolder1_strMM',
                year: '#ctl00_ContentPlaceHolder1_strYY',
                cvv: '#check_num'
            },
            login: {
                id: ['#login_id', 'input[name="id"]', 'input[name="userid"]', 'input#userid', 'input#loginId'],
                pw: ['#login_pw', 'input[name="password"]', 'input[type="password"]', 'input#loginPw', 'input[name="pw"]'],
                btn: ['#login_btn', '.btn-login', 'button[onclick*="login"]']
            }
        }
    };

    // ----------------------------
    // 核心優化：MutationObserver 等待機制
    // ----------------------------
    function getElement(selectorOrXPath, isXPath = false) {
        if (isXPath) {
            return document.evaluate(selectorOrXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        }
        // 如果是陣列選擇器
        if (Array.isArray(selectorOrXPath)) {
            for (const sel of selectorOrXPath) {
                const el = document.querySelector(sel);
                if (el) return el;
            }
            return null;
        }
        return document.querySelector(selectorOrXPath);
    }

    // 優化後的等待函數：使用 Observer 替代 setInterval
    function waitForElement(selectorOrXPath, { timeout = CONFIG.elementTimeout, isXPath = false } = {}) {
        return new Promise((resolve, reject) => {
            // 1. 如果元素已經存在，直接回傳
            const existing = getElement(selectorOrXPath, isXPath);
            if (existing && existing.offsetParent !== null) {
                return resolve(existing);
            }

            // 2. 開啟觀察者模式
            const observer = new MutationObserver(() => {
                const el = getElement(selectorOrXPath, isXPath);
                if (el && el.offsetParent !== null) { // 確保元素可見
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true, attributes: true });

            // 3. 設定超時
            const timer = setTimeout(() => {
                observer.disconnect();
                // 不拋出錯誤，而是回傳 null，讓流程可以繼續
                console.warn(`等待超時（非致命）：${selectorOrXPath}`);
                resolve(null);
            }, timeout);
        });
    }

    // ----------------------------
    // 動作執行函式
    // ----------------------------
    function fillInput(el, value) {
        if (!el || !value) return;
        el.focus();
        el.value = value;
        el.setAttribute('value', value);
        // 現代框架通常只需要 input 事件
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // 移除 blur，減少畫面閃爍
        console.log(`已填寫：${value}`);
    }

    function triggerClick(el, isCheckbox = false) {
        if (!el) return;

        // 嘗試最簡單的 click
        el.click();

        // 補強：如果是 Checkbox 或 Label，確保狀態改變
        if (isCheckbox || (el.tagName === 'INPUT' && el.type === 'checkbox')) {
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // 對於頑固的按鈕，補發 mousedown/mouseup
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        }
    }

    // ----------------------------
    // 業務邏輯：檔案與介面
    // ----------------------------
    function setActiveProfile(key) {
        if (!PROFILES[key]) return;
        activeProfileKey = key;
        activeProfile = PROFILES[key];
        GM_setValue('zihzih_activeProfile', key);
        console.log(`已切換檔案為：${activeProfile.label}`);
    }

    function createProfileSwitcher() {
        if (location.host !== 'tw.atomy.com' || document.getElementById('zihzihProfileSwitcher')) return;

        const box = document.createElement('div');
        box.id = 'zihzihProfileSwitcher';
        box.style.cssText = 'position:fixed;top:80px;right:10px;z-index:99999;display:flex;flex-direction:column;gap:6px;';

        const checkoutRow = document.createElement('div');
        checkoutRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;';

        const checkoutBtn = document.createElement('button');
        checkoutBtn.dataset.checkout = 'toggle';
        checkoutBtn.style.cssText = 'padding:6px 12px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;color:#fff;';
        checkoutRow.appendChild(checkoutBtn);

        const deliveryBtn = document.createElement('button');
        deliveryBtn.dataset.delivery = 'toggle';
        deliveryBtn.style.cssText = 'padding:6px 12px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;color:#fff;';
        checkoutRow.appendChild(deliveryBtn);

        const profileGrid = document.createElement('div');
        profileGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3, auto);gap:6px;justify-content:end;';

        Object.values(PROFILES).forEach(p => {
            const btn = document.createElement('button');
            btn.dataset.p = p.key;
            btn.textContent = p.label;
            btn.style.cssText = 'padding:6px 12px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;color:#fff;';
            profileGrid.appendChild(btn);
        });

        box.appendChild(checkoutRow);
        box.appendChild(profileGrid);
        document.body.appendChild(box);

        const updateStyles = () => {
            box.querySelectorAll('button').forEach(btn => {
                if (btn.dataset.p) {
                    btn.style.background = btn.dataset.p === activeProfileKey ? '#16a34a' : '#6b7280';
                }
                if (btn.dataset.checkout !== undefined) {
                    btn.style.background = autoCheckoutEnabled ? '#dc2626' : '#6b7280';
                    btn.textContent = autoCheckoutEnabled ? '自動結帳：ON' : '自動結帳：OFF';
                }
                if (btn.dataset.delivery !== undefined) {
                    btn.style.background = autoDeliveryEnabled ? '#2563eb' : '#6b7280';
                    btn.textContent = autoDeliveryEnabled ? '自動配送：ON' : '自動配送：OFF';
                }
            });
        };

        box.querySelectorAll('button').forEach(btn => {
            if (btn.dataset.p) {
                btn.addEventListener('click', () => {
                    setActiveProfile(btn.dataset.p);
                    updateStyles();
                });
            }
            if (btn.dataset.checkout !== undefined) {
                btn.addEventListener('click', () => {
                    autoCheckoutEnabled = !autoCheckoutEnabled;
                    GM_setValue('zihzih_autoCheckout', autoCheckoutEnabled);
                    updateStyles();
                });
            }
            if (btn.dataset.delivery !== undefined) {
                btn.addEventListener('click', () => {
                    autoDeliveryEnabled = !autoDeliveryEnabled;
                    GM_setValue('zihzih_autoDelivery', autoDeliveryEnabled);
                    updateStyles();
                });
            }
        });

        updateStyles();
    }

    // ----------------------------
    // 業務邏輯：自動登入流程
    // ----------------------------
    function initLogoutListener() {
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('a, button, span');
            if (!target) return;
            const txt = (target.innerText || '').trim();
            const href = (target.getAttribute('href') || '').toLowerCase();
            const onclick = (target.getAttribute('onclick') || '').toLowerCase();

            if (txt === '登出' || href.includes('logout') || onclick.includes('logout')) {
                console.log('偵測到登出，標記自動登入');
                GM_setValue('zihzih_autoLoginPending', true);
            }
        }, true);
    }

    async function handleAutoLoginCheck() {
        if (!GM_getValue('zihzih_autoLoginPending', false)) return;
        if (location.href.includes('/login') || document.querySelector('#login_id')) return; // 已在登入頁

        // 找登入按鈕
        const btn = Array.from(document.querySelectorAll('a, span')).find(el => {
            const t = el.innerText?.trim();
            return (t === '登入' || t === 'Login') && el.offsetParent !== null;
        });

        if (btn) {
            console.log('自動點擊登入按鈕');
            triggerClick(btn);
        }
    }

    // ----------------------------
    // 頁面處理邏輯
    // ----------------------------

    // 1. 登入頁面 (極速版)
    async function handleLoginPage() {
        if (!activeProfile.login) return;

        // 並行等待帳號與密碼欄位
        Promise.all([
            waitForElement(CONFIG.selectors.login.id),
            waitForElement(CONFIG.selectors.login.pw)
        ]).then(([idInput, pwInput]) => {
            if (idInput) fillInput(idInput, activeProfile.login.id);
            if (pwInput) fillInput(pwInput, activeProfile.login.pw);

            // 填完清除標記
            if (GM_getValue('zihzih_autoLoginPending')) {
                GM_setValue('zihzih_autoLoginPending', false);
            }
        });
    }

    // 2. 訂單頁面 (極速並行版)
    async function handleOrderPage() {
        console.log(`訂單頁面處理中 (${activeProfile.label})...`);

        // 工作 A：點擊配送按鈕 (最高優先級，可能導致頁面刷新)
        const taskDelivery = async () => {
            if (!autoDeliveryEnabled) {
                console.log('自動配送為 OFF，略過工作 A');
                return;
            }
            const btn = await waitForElement(CONFIG.selectors.deliveryButtonXPath, { isXPath: true });
            if (btn) {
                triggerClick(btn);
                console.log('已點擊配送至教育中心');
            }
        };

        // 工作 B：填寫收件人與手機 (獨立等待，與 A 並行)
        const taskRecipient = async () => {
            const [nameEl, phoneEl] = await Promise.all([
                waitForElement(CONFIG.selectors.recipientField),
                waitForElement(CONFIG.selectors.phoneField)
            ]);
            if (nameEl) fillInput(nameEl, activeProfile.recipient);
            if (phoneEl) fillInput(phoneEl, activeProfile.phone);
        };

        // 工作 C：載具 (獨立等待)
        const taskCarrier = async () => {
            if (!activeProfile.targetInputValue) return;
            const checkbox = await waitForElement(CONFIG.selectors.targetCheckboxXPath, { isXPath: true });
            if (checkbox) {
                triggerClick(checkbox, true);
                const input = await waitForElement(CONFIG.selectors.targetInputXPath, { isXPath: true });
                if (input) fillInput(input, activeProfile.targetInputValue);
            }
        };

        // 工作 D：付款方式與條款 (獨立等待)
        const taskPaymentAndAgreements = async () => {
            // 付款方式
            const payOpt = await waitForElement(CONFIG.selectors.paymentOptionXPath, { isXPath: true });
            if (payOpt) triggerClick(payOpt);

            // 同意條款 (嘗試 checkbox 或 label)
            const agreeCheck = await waitForElement(CONFIG.selectors.agreementCheckInputXPath, { isXPath: true, timeout: 8000 });
            if (agreeCheck) {
                triggerClick(agreeCheck, true);
            } else {
                const agreeLabel = await waitForElement(CONFIG.selectors.agreementCheckLabelXPath, { isXPath: true, timeout: 2000 });
                if (agreeLabel) triggerClick(agreeLabel, true);
            }
        };

        // 讓所有任務同時開跑 (Fire and Forget)
        // 使用 Promise.allSettled 確保一個失敗不會卡住其他
        Promise.allSettled([
            taskDelivery(),
            taskRecipient(),
            taskCarrier(),
            taskPaymentAndAgreements()
        ]).then(async () => {
            console.log('訂單頁面操作 A–D 完成，準備執行工作 E（結帳）');

            if (!autoCheckoutEnabled) {
                console.log('自動結帳為 OFF，略過工作 E');
                return;
            }

            await new Promise(r => setTimeout(r, 500));
            const payBtn = document.querySelector('button[sheet-role="pay-button"]');
            if (payBtn && payBtn.offsetParent !== null) {
                triggerClick(payBtn);
                console.log('已點擊結帳按鈕');
            } else {
                console.warn('找不到結帳按鈕，工作 E 未執行');
            }
        });
    }

    // 3. 信用卡頁面 (保持原樣，安全模式)
    function getNextCreditCard() {
        const key = `zihzih_lastCreditCardIndex_${activeProfileKey}`;
        const lastIndex = Number(GM_getValue(key, -1));
        const nextIndex = (lastIndex + 1) % activeProfile.creditCards.length;
        GM_setValue(key, nextIndex);
        return activeProfile.creditCards[nextIndex];
    }

    async function handleCreditCardPage() {
        try {
            const card = getNextCreditCard();
            // 保持原本的延遲，避開防爬蟲偵測
            await new Promise(r => setTimeout(r, card.fillDelay));

            console.log(`填寫信用卡...`);

            // 這裡保留序列執行，因為銀行頁面較敏感
            const num = await waitForElement(CONFIG.selectors.creditCard.number);
            fillInput(num, card.number);

            const mon = await waitForElement(CONFIG.selectors.creditCard.month);
            fillInput(mon, card.month);

            const yer = await waitForElement(CONFIG.selectors.creditCard.year);
            fillInput(yer, card.year);

            const cvv = await waitForElement(CONFIG.selectors.creditCard.cvv);
            fillInput(cvv, card.cvv);

            console.log('信用卡填寫完成');
        } catch (e) {
            console.error('信用卡填寫錯誤', e);
        }
    }

    // ----------------------------
    // 2. 購物車頁面（cart/view）
    async function handleCartPage() {
        console.log('購物車頁面處理中（cart/view）');

        if (!autoCheckoutEnabled) {
            console.log('自動結帳為 OFF，略過購物車結帳');
            return;
        }

        const em = await waitForElement('button.sp em[fxd-total="count"]');
        const btn = em ? em.closest('button') : null;
        if (btn && btn.offsetParent !== null) {
            await new Promise(r => setTimeout(r, 100));
            triggerClick(btn);
            console.log('已於購物車頁面點擊「總共結帳」');
        } else {
            console.warn('購物車頁面找不到結帳按鈕');
        }
    }

    // ----------------------------
    // 主程式入口
    async function main() {
        const url = location.href;

        // 1. 建立 UI
        createProfileSwitcher();

        // 2. 全域監聽登出
        initLogoutListener();

        // 3. 檢查自動登入
        await handleAutoLoginCheck();

        // 4. 路由判斷
        if (url.includes('tw.atomy.com/cart/view')) {
            handleCartPage();
        } else if (url.includes('tw.atomy.com/order/sheet')) {
            handleOrderPage();
        } else if (url.includes('sslpayment.uwccb.com.tw')) {
            handleCreditCardPage();
        } else if (url.includes('/login') || document.querySelector('#login_id')) {
            handleLoginPage();
            const obs = new MutationObserver(() => {
                if (document.querySelector('#login_id')) {
                    handleLoginPage();
                    obs.disconnect();
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    }

    // 移除舊版 waitForPageLoad，改用更快的 DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

})();

