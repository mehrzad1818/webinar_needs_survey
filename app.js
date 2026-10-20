(() => {
  'use strict';

  const form = document.getElementById('surveyForm');
  const categoryGrid = document.getElementById('categoryGrid');
  const search = document.getElementById('topicSearch');
  const selectedCount = document.getElementById('selectedCount');
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const noSearchResults = document.getElementById('noSearchResults');
  const message = document.getElementById('formMessage');
  const submitButton = document.getElementById('submitButton');
  const honeypot = document.getElementById('honeypot');
  const responseFrame = document.getElementById('responseFrame');
  const REQUIRED_QUESTIONS = 5;
  let isSubmitting = false;
  let responseTimeout = null;
  let activeSubmissionId = '';
  let pendingSubmissionId = '';
  let pendingPayloadSignature = '';

  function createSubmissionId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  const faNumber = value => new Intl.NumberFormat('fa-IR').format(value);

  function makeTopicOption(category, topic, categoryIndex, topicIndex) {
    const label = document.createElement('label');
    label.className = 'topic-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'selectedTopics';
    input.value = topic;
    input.dataset.category = category;
    input.dataset.topic = topic;
    input.id = `topic-${categoryIndex}-${topicIndex}`;
    const customCheck = document.createElement('span');
    customCheck.className = 'custom-check';
    customCheck.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = topic;
    label.htmlFor = input.id;
    label.append(input, customCheck, text);
    return label;
  }

  function renderCategories() {
    const fragment = document.createDocumentFragment();
    window.SURVEY_CATEGORIES.forEach((category, index) => {
      const details = document.createElement('details');
      details.className = 'category-card';
      details.dataset.category = category.title;

      const summary = document.createElement('summary');
      const num = document.createElement('span');
      num.className = 'category-index';
      num.textContent = faNumber(index + 1).padStart(2, '۰');
      const summaryText = document.createElement('span');
      summaryText.className = 'category-summary-text';
      const title = document.createElement('span');
      title.className = 'category-title';
      title.textContent = category.title;
      const count = document.createElement('span');
      count.className = 'category-count';
      count.textContent = `${faNumber(category.topics.length)} زیرموضوع`;
      summaryText.append(title, count);
      summary.append(num, summaryText);

      const content = document.createElement('div');
      content.className = 'category-content';
      const desc = document.createElement('p');
      desc.className = 'category-description';
      desc.textContent = 'موضوع‌های موردعلاقه را انتخاب کنید:';
      content.append(desc);
      category.topics.forEach((topic, topicIndex) => {
        content.append(makeTopicOption(category.title, topic, index + 1, topicIndex + 1));
      });

      const otherWrap = document.createElement('div');
      otherWrap.className = 'category-other';
      const otherLabel = document.createElement('label');
      const otherId = `category-other-${index + 1}`;
      otherLabel.htmlFor = otherId;
      otherLabel.textContent = 'سایر موارد (اختیاری)';
      const otherInput = document.createElement('input');
      otherInput.type = 'text';
      otherInput.id = otherId;
      otherInput.className = 'category-other-input';
      otherInput.maxLength = 500;
      otherInput.placeholder = 'موضوع دیگری در این حوزه…';
      otherInput.dataset.category = category.title;
      otherInput.autocomplete = 'off';
      otherWrap.append(otherLabel, otherInput);
      content.append(otherWrap);
      details.append(summary, content);
      fragment.append(details);
    });
    categoryGrid.append(fragment);
  }

  function getSelectedTopics() {
    const selected = [...document.querySelectorAll('input[name="selectedTopics"]:checked')].map(input => ({
      category: input.dataset.category,
      topic: input.dataset.topic,
      isOther: false
    }));
    document.querySelectorAll('.category-other-input').forEach(input => {
      const value = input.value.trim();
      if (value) selected.push({ category: input.dataset.category, topic: value, isOther: true });
    });
    return selected;
  }

  function countAnsweredRequired() {
    let completed = 0;
    if (form.querySelector('input[name="webinarFormat"]:checked')) completed++;
    if (form.querySelector('input[name="barriers"]:checked')) completed++;
    if (form.querySelector('input[name="discussionLevel"]:checked')) completed++;
    if (form.querySelector('input[name="audienceType"]:checked')) completed++;
    if (form.querySelector('input[name="webinarGoals"]:checked')) completed++;
    return completed;
  }

  function updateProgress() {
    const selected = getSelectedTopics().length;
    selectedCount.textContent = faNumber(selected);
    const answered = countAnsweredRequired();
    progressText.textContent = `${faNumber(answered)} از ${faNumber(REQUIRED_QUESTIONS)} پرسش عمومی ضروری`;
    progressBar.style.width = `${Math.round(answered / REQUIRED_QUESTIONS * 100)}%`;
  }

  function filterTopics() {
    const q = search.value.trim().toLocaleLowerCase('fa');
    let visibleCategories = 0;
    document.querySelectorAll('.category-card').forEach(card => {
      const title = card.dataset.category.toLocaleLowerCase('fa');
      const titleMatches = !q || title.includes(q);
      let visibleTopics = 0;
      card.querySelectorAll('.topic-option').forEach(option => {
        const topicText = option.textContent.toLocaleLowerCase('fa');
        const visible = !q || titleMatches || topicText.includes(q);
        option.classList.toggle('search-hidden', !visible);
        if (visible) visibleTopics++;
      });
      const otherWrap = card.querySelector('.category-other');
      const visible = !q || titleMatches || visibleTopics > 0;
      card.hidden = !visible;
      if (visible) visibleCategories++;
      if (q && visible && !card.open) card.open = true;
      if (q && visible && !titleMatches) {
        card.querySelectorAll('.topic-option').forEach(option => {
          if (!option.textContent.toLocaleLowerCase('fa').includes(q)) option.classList.add('search-hidden');
        });
      } else if (otherWrap) {
        otherWrap.hidden = false;
      }
    });
    noSearchResults.hidden = visibleCategories !== 0;
  }

  function showMessage(text, kind) {
    message.textContent = text;
    message.className = `form-message ${kind}`;
    message.hidden = false;
    message.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = '';
    message.className = 'form-message';
  }

  function toggleOtherFields() {
    document.querySelectorAll('[data-reveals]').forEach(input => {
      const target = document.getElementById(`${input.dataset.reveals}Wrap`);
      if (target) target.hidden = !input.checked;
    });
  }

  function validateForm() {
    document.querySelectorAll('.question-card').forEach(card => card.classList.remove('invalid'));
    document.querySelectorAll('.field-error').forEach(err => err.hidden = true);
    const checks = [
      { key: 'webinarFormat', ok: !!form.querySelector('input[name="webinarFormat"]:checked') },
      { key: 'barriers', ok: !!form.querySelector('input[name="barriers"]:checked') },
      { key: 'discussionLevel', ok: !!form.querySelector('input[name="discussionLevel"]:checked') },
      { key: 'audienceType', ok: !!form.querySelector('input[name="audienceType"]:checked') },
      { key: 'webinarGoals', ok: !!form.querySelector('input[name="webinarGoals"]:checked') }
    ];
    let valid = true;
    checks.forEach(check => {
      if (!check.ok) {
        valid = false;
        const err = document.querySelector(`[data-error-for="${check.key}"]`);
        if (err) err.hidden = false;
        const card = err?.closest('.question-card');
        if (card) card.classList.add('invalid');
      }
    });
    const format = form.querySelector('input[name="webinarFormat"]:checked');
    const audience = form.querySelector('input[name="audienceType"]:checked');
    const barrierOther = form.querySelector('input[name="barriers"][value="سایر موارد"]:checked');
    const goalsOther = form.querySelector('input[name="webinarGoals"][value="سایر موارد"]:checked');
    const conditionalFields = [
      { chosen: format?.value === 'سایر موارد', input: document.getElementById('formatOther'), label: 'قالب پیشنهادی خود را هم بنویسید.' },
      { chosen: !!barrierOther, input: document.getElementById('barrierOther'), label: 'لطفاً عامل دیگر را توضیح دهید.' },
      { chosen: audience?.value === 'سایر موارد', input: document.getElementById('audienceOther'), label: 'لطفاً عنوان یا وضعیت خود را بنویسید.' },
      { chosen: !!goalsOther, input: document.getElementById('goalsOther'), label: 'لطفاً هدف دیگر خود را بنویسید.' }
    ];
    conditionalFields.forEach(field => {
      if (field.chosen && !field.input.value.trim()) {
        valid = false;
        field.input.setAttribute('aria-invalid', 'true');
        field.input.style.borderColor = '#d97980';
        field.input.title = field.label;
      } else {
        field.input.removeAttribute('aria-invalid');
        field.input.style.borderColor = '';
        field.input.title = '';
      }
    });
    if (!valid) {
      showMessage('برای ادامه، لطفاً پنج پرسش عمومی ضروری را تکمیل کنید و توضیح گزینه‌های «سایر موارد» را در صورت انتخاب بنویسید.', 'error');
      const firstError = document.querySelector('.question-card.invalid');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return valid;
  }

  function collectPayload() {
    const selectedFormat = form.querySelector('input[name="webinarFormat"]:checked');
    const selectedAudience = form.querySelector('input[name="audienceType"]:checked');
    return {
      schemaVersion: 1,
      honeypot: honeypot.value.trim(),
      answers: {
        webinarFormat: selectedFormat?.value || '',
        webinarFormatOther: document.getElementById('formatOther').value.trim(),
        barriers: [...form.querySelectorAll('input[name="barriers"]:checked')].map(el => el.value),
        barrierOther: document.getElementById('barrierOther').value.trim(),
        discussionLevel: form.querySelector('input[name="discussionLevel"]:checked')?.value || '',
        audienceType: selectedAudience?.value || '',
        audienceOther: document.getElementById('audienceOther').value.trim(),
        webinarGoals: [...form.querySelectorAll('input[name="webinarGoals"]:checked')].map(el => el.value),
        goalsOther: document.getElementById('goalsOther').value.trim(),
        selectedTopics: getSelectedTopics()
      }
    };
  }

  function setBusy(busy) {
    isSubmitting = busy;
    submitButton.disabled = busy;
    submitButton.querySelector('span:first-child').textContent = busy ? 'در حال ثبت…' : 'ثبت پاسخ‌ها';
  }

  function sendPayload(payload) {
    const endpoint = window.SURVEY_CONFIG?.appsScriptUrl?.trim() || '';
    if (!endpoint || endpoint.includes('PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') || !endpoint.includes('/exec')) {
      showMessage('هنوز نشانی وب‌اپ Google Apps Script تنظیم نشده است. طبق راهنما، نشانی منتشرشده‌ای که به /exec ختم می‌شود را در فایل config.js قرار دهید.', 'error');
      return false;
    }

    // Reuse the same ID when retrying identical answers. The Apps Script endpoint
    // uses it to avoid saving a duplicate if the first response was stored but its
    // acknowledgement was delayed or lost in the cross-origin iframe.
    const payloadSignature = JSON.stringify(payload.answers);
    if (!pendingSubmissionId || pendingPayloadSignature !== payloadSignature) {
      pendingSubmissionId = createSubmissionId();
      pendingPayloadSignature = payloadSignature;
    }
    payload.submissionId = pendingSubmissionId;
    activeSubmissionId = pendingSubmissionId;

    const transport = document.createElement('form');
    transport.method = 'POST';
    transport.action = endpoint;
    transport.target = 'responseFrame';
    transport.acceptCharset = 'UTF-8';
    const payloadInput = document.createElement('input');
    payloadInput.type = 'hidden';
    payloadInput.name = 'payload';
    payloadInput.value = JSON.stringify(payload);
    transport.append(payloadInput);
    document.body.append(transport);
    setBusy(true);
    clearMessage();
    transport.submit();
    window.setTimeout(() => transport.remove(), 1000);
    responseTimeout = window.setTimeout(() => {
      responseTimeout = null;
      if (!isSubmitting) return;
      setBusy(false);
      showMessage('تأیید نهایی ثبت پاسخ هنوز دریافت نشده است. ممکن است پاسخ شما در Google Sheets ثبت شده باشد؛ لطفاً برای جلوگیری از ثبت تکراری، ابتدا برگه «پاسخ‌ها» را بررسی کنید. اگر پاسخ ثبت نشده بود، همین فرم را دوباره ارسال کنید.', 'error');
    }, 60000);
    return true;
  }

  window.addEventListener('message', event => {
    // Apps Script HtmlService may wrap its response in a nested sandboxed iframe,
    // so event.source is not always the responseFrame itself. Match the one-time
    // submission ID instead of rejecting the legitimate acknowledgement.
    const data = event.data;
    if (!data || data.type !== 'survey-submit' || !data.submissionId || data.submissionId !== activeSubmissionId) return;
    if (responseTimeout) { window.clearTimeout(responseTimeout); responseTimeout = null; }
    activeSubmissionId = '';
    if (data.status === 'success') {
      setBusy(false);
      pendingSubmissionId = '';
      pendingPayloadSignature = '';
      showMessage('پاسخ شما با موفقیت ثبت شد. از وقتی که گذاشتید سپاسگزاریم!', 'success');
      form.reset();
      document.querySelectorAll('.category-card').forEach(card => { card.open = false; card.hidden = false; });
      document.querySelectorAll('.topic-option').forEach(option => option.classList.remove('search-hidden'));
      document.querySelectorAll('.field-error').forEach(err => err.hidden = true);
      document.querySelectorAll('.question-card').forEach(card => card.classList.remove('invalid'));
      search.value = '';
      toggleOtherFields();
      updateProgress();
      // Keep the success message in view; scrolling back to the submit heading here
      // used to move the acknowledgement out of the participant's viewport.
    } else {
      setBusy(false);
      showMessage('ثبت پاسخ انجام نشد. پاسخ‌های واردشده در فرم باقی مانده‌اند؛ لطفاً تنظیم وب‌اپ و دسترسی آن را بررسی کنید و سپس دوباره تلاش کنید.', 'error');
    }
  });

  renderCategories();
  updateProgress();
  toggleOtherFields();

  categoryGrid.addEventListener('change', event => {
    if (event.target.matches('input')) updateProgress();
  });
  categoryGrid.addEventListener('input', event => {
    if (event.target.matches('.category-other-input')) updateProgress();
  });
  form.addEventListener('change', event => {
    if (event.target.matches('input')) { toggleOtherFields(); updateProgress(); clearMessage(); }
  });
  form.addEventListener('input', event => {
    if (event.target.matches('.other-answer input')) clearMessage();
  });
  search.addEventListener('input', filterTopics);
  document.getElementById('expandAll').addEventListener('click', () => {
    document.querySelectorAll('.category-card:not([hidden])').forEach(card => card.open = true);
  });
  document.getElementById('collapseAll').addEventListener('click', () => {
    document.querySelectorAll('.category-card').forEach(card => card.open = false);
  });
  document.getElementById('resetButton').addEventListener('click', () => {
    if (!window.confirm('همه پاسخ‌های واردشده پاک شوند؟')) return;
    form.reset();
    search.value = '';
    document.querySelectorAll('.category-card').forEach(card => { card.open = false; card.hidden = false; });
    document.querySelectorAll('.topic-option').forEach(option => option.classList.remove('search-hidden'));
    document.querySelectorAll('.question-card').forEach(card => card.classList.remove('invalid'));
    document.querySelectorAll('.field-error').forEach(err => err.hidden = true);
    toggleOtherFields(); updateProgress(); clearMessage();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (isSubmitting) return;
    clearMessage();
    if (!validateForm()) return;
    const payload = collectPayload();
    // A simple honeypot helps filter basic automated spam without adding a third-party service.
    if (payload.honeypot) {
      showMessage('پاسخ شما ثبت شد. از همراهی شما سپاسگزاریم!', 'success');
      form.reset(); toggleOtherFields(); updateProgress(); return;
    }
    sendPayload(payload);
  });
})();
