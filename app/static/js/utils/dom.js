/**
 * DOM Utilities for Securithon Lab
 */

export const $ = (selector, context = document) => context.querySelector(selector);
export const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

export const setElementText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
};

export const setElementHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
};

export const toggleClass = (selector, className, force) => {
    $$(selector).forEach(el => el.classList.toggle(className, force));
};
