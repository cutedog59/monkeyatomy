// ==UserScript==
// @name         kr-atomy-autofill
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Atomy KR 
// @match        https://kr.atomy.com/*
// @match        https://*.tosspayments.com/*
// @match        https://payment-gateway.tosspayments.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    const SAVED_PROFILE = GM_getValue('ATOMY_KR_ACTIVE_PROFILE', 'card1');

    const CONFIG = {
        activeProfile: SAVED_PROFILE, 
        profiles: {
            card1: {
                label: 'XXXX',
                sender: { name: 'tw', phone: '01011112222' },
                receiver: {
                    name: 'tw',
                    phone: '01011112222',
                    addressKeyword: '韓文地址',
                    detailAddress: '韓文地址'
                },
                email: 'a@gmail.com',
                card: {
                    number: ['1111','2222','3333','4444'],
                    expiry: '01/39'
                }
            },
            card2: {
                label: 'XXXX',
                sender: { name: 'tw', phone: '01011112222' },
                receiver: {
                    name: 'tw',
                    phone: '01011112222',
                    addressKeyword: '韓文地址',
                    detailAddress: '韓文地址'
                },
                email: 'a@gmail.com',
                card: {
                    number: ['1111','2222','3333','4444'],
                    expiry: '01/39'
                }
            },
            card3: {
                label: 'XXXX',
                sender: { name: 'tw', phone: '01011112222' },
                receiver: {
                    name: 'tw',
                    phone: '01011112222',
                    addressKeyword: '韓文地址',
                    detailAddress: '韓文地址'
                },
                email: 'a@gmail.com',
                card: {
                    number: ['1111','2222','3333','4444'],
                    expiry: '01/39'
                }
            },
            card4: {
                label: 'XXXX',
                sender: { name: 'tw', phone: '01011112222' },
                receiver: {
                    name: 'tw',
                    phone: '01011112222',
                    addressKeyword: '韓文地址',
                    detailAddress: '韓文地址'
                },
                email: 'a@gmail.com',
                card: {
                    number: ['1111','2222','3333','4444'],
                    expiry: '01/39'
                }
            }
        },
        debounceTime: 150
    };

    const STATE = {
        cartChecked: false,
        senderFilled: false,
        paymentTabSelected: false,
        paymentRadioSelected: false,
        tossEmailFilled: false,
        tossAgreed: false,
        lastSearchState: false,
        lastAddState: false
    };

    function trigger(el, type) {
        if (!el) return;
        el.dispatchEvent(new Event(type, { bubbles: true }));
        if (type === 'click') {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
        }
    }

    function fillInput(el, value) {
        if (!el || el.value === value) return false;
        el.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(el, value);
        trigger(el, 'input');
        trigger(el, 'change');
        el.blur();
        return true;
    }

    function debounce(func, wait) {
        let timeout;
        return function () {
            const context = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    function handleTossInIframe() {
        const P = CONFIG.profiles[CONFIG.activeProfile];

        if (!STATE.tossEmailFilled) {
            const emailInput = document.querySelector('input[type="email"][name="email"]');
            if (emailInput && fillInput(emailInput, P.email)) {
                STATE.tossEmailFilled = true;
            }
        }

        const cardInputs = document.querySelectorAll('input[name^="cardNumber."]');
        if (cardInputs.length === 4) {
            cardInputs.forEach((el, idx) => fillInput(el, P.card.number[idx] || ''));
        }

        const expInput = document.querySelector('input[name="cardExpiry"]');
        if (expInput) fillInput(expInput, P.card.expiry);

        if (!STATE.tossAgreed) {
            const requiredCb = document.querySelector('input[type="checkbox"][aria-label*="Required"]');
            if (requiredCb && !requiredCb.checked) {
                requiredCb.click();
                STATE.tossAgreed = true;
            }
        }
    }

    function handleCartPage() {
        if (STATE.cartChecked) return;
        const allChk = document.querySelector('input[all-checkbox]');
        const itemChks = document.querySelectorAll('input[cart-checkbox]');
        const needCheck = (allChk && !allChk.checked) || Array.from(itemChks).some(cb => !cb.checked);

        if (needCheck) {
            if (allChk && !allChk.checked) allChk.click();
            else itemChks.forEach(cb => { if (!cb.checked) cb.click(); });
            STATE.cartChecked = true;
        }
    }

    function taskSender() {
        if (STATE.senderFilled) return;
        const P = CONFIG.profiles[CONFIG.activeProfile];
        if (!P || !P.sender) return;
        const nameInput = document.querySelector('input[input-data-role="name"]');
        const phoneInput = document.querySelector('input[input-data-role="phoneNo"]');
        let filled = false;
        if (nameInput) filled = fillInput(nameInput, P.sender.name) || filled;
        if (phoneInput) filled = fillInput(phoneInput, P.sender.phone) || filled;
        if (filled) STATE.senderFilled = true;
    }

    function taskPaymentMethod() {
        if (!STATE.paymentTabSelected) {
            const cardTab = document.querySelector('button[pay-mean-cd="1201"]');
            if (cardTab) {
                if (cardTab.getAttribute('aria-selected') !== 'true') cardTab.click();
                STATE.paymentTabSelected = true;
            }
        }
        if (STATE.paymentTabSelected && !STATE.paymentRadioSelected) {
            const overseasRadio = document.querySelector('input[name="mth-card_rdo"][value="1202"]');
            if (overseasRadio) {
                if (!overseasRadio.checked) overseasRadio.click();
                STATE.paymentRadioSelected = true;
            }
        }
        const reuseChk = document.querySelector('#mth-reuse_ck');
        const agreeChk = document.querySelector('input[terms-role^="terms-input-"]');
        if(reuseChk && !reuseChk.checked) reuseChk.click();
        if(agreeChk && !agreeChk.checked) agreeChk.click();
    }

    function taskAddressAutoFill() {
        const P = CONFIG.profiles[CONFIG.activeProfile];
        if (!P || !P.receiver) return;

        const searchLayer = document.querySelector('#lyr_pay_addr_find');
        const addLayer = document.querySelector('#lyr_pay_addr_add');

        if (searchLayer && searchLayer.style.display !== 'none') {
            const keyInput = searchLayer.querySelector('input[address-role="keyword"]');
            const searchBtn = searchLayer.querySelector('button[address-role="search-button"]');

            if (keyInput && !keyInput.dataset.filled) {
                fillInput(keyInput, P.receiver.addressKeyword);
                if (searchBtn) {
                    searchBtn.click();
                    keyInput.dataset.filled = "true";
                }
            } else if (keyInput && keyInput.dataset.filled === "true") {
                const resultBtn = searchLayer.querySelector('button[address-role="select-button"]');
                if (resultBtn) {
                    resultBtn.click();
                    keyInput.dataset.filled = "false";
                }
            }
        }

        if (addLayer && addLayer.style.display !== 'none') {
            if (addLayer.dataset.autoFilled === "true") return;

            fillInput(addLayer.querySelector('#dlvpNm'), P.receiver.name);
            fillInput(addLayer.querySelector('#cellNo'), P.receiver.phone);

            const baseChk = addLayer.querySelector('#baseYn');
            if (baseChk && !baseChk.checked) baseChk.click();

            const detailInput = addLayer.querySelector('#dtlAddr');
            if (detailInput) {
                fillInput(detailInput, P.receiver.detailAddress);
                const submitBtn = addLayer.querySelector('#btnSubmit');
                if (submitBtn) {
                    setTimeout(() => submitBtn.click(), 100);
                    addLayer.dataset.autoFilled = "true";
                }
            }
        } else {
            if (addLayer) addLayer.dataset.autoFilled = "false";
        }
    }

    const isIframe = window.self !== window.top || location.hostname.includes('tosspayments');

    const mainLoop = debounce(() => {
        if (isIframe) {
            handleTossInIframe();
            return;
        }

        const url = window.location.href;
        if (url.includes('/cart/')) {
            handleCartPage();
        } else if (url.includes('/order/')) {
            taskSender();
            taskPaymentMethod();
            taskAddressAutoFill();
        }
    }, CONFIG.debounceTime);

    const observer = new MutationObserver(mainLoop);
    window.addEventListener('load', mainLoop);
    window.addEventListener('popstate', mainLoop);
    observer.observe(document.body, { childList: true, subtree: true });
    mainLoop();

    function injectProfileSwitch() {
        if (document.getElementById('auto-profile-wrap')) return;

        const wrap = document.createElement('div');
        wrap.id = 'auto-profile-wrap';
        Object.assign(wrap.style, {
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            zIndex: 99999,
            display: 'flex',
            gap: '6px'
        });

        function makeBtn(key) {
            const btn = document.createElement('button');
            btn.textContent = CONFIG.profiles[key].label;
            Object.assign(btn.style, {
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #3182f6',
                background: CONFIG.activeProfile === key ? '#3182f6' : '#fff',
                color: CONFIG.activeProfile === key ? '#fff' : '#3182f6',
                cursor: 'pointer',
                fontSize: '13px'
            });
            btn.onclick = () => {
                if (CONFIG.activeProfile === key) return;
                CONFIG.activeProfile = key;
                GM_setValue('ATOMY_KR_ACTIVE_PROFILE', key);
                STATE.tossEmailFilled = false;
                STATE.tossAgreed = false;
                document.getElementById('auto-profile-wrap').remove();
                injectProfileSwitch();
                console.log('[Profile] switched to', key);
            };
            return btn;
        }

        wrap.appendChild(makeBtn('card1'));
        wrap.appendChild(makeBtn('card2'));
        wrap.appendChild(makeBtn('card3'));
        wrap.appendChild(makeBtn('card4'));
        document.body.appendChild(wrap);
    }

    injectProfileSwitch();

    console.log('[AutoFlow 0.9] KR Auto-Fill with Card Profiles enabled');
})();