(function () {
    'use strict';

    var form = document.querySelector('form[data-questionnaire-flow]');
    if (!form) return;

    var flowType = form.getAttribute('data-questionnaire-flow');
    var privacy = form.querySelector('.form-privacy');
    var privacyCheckbox = form.querySelector('#privacyCheck');
    var submitButton = form.querySelector('#submitBtn');
    var currentStep = 0;
    var steps = [];

    function buildSleepSteps() {
        var headings = Array.prototype.slice.call(form.children).filter(function (element) {
            return element.tagName === 'H3';
        });

        headings.forEach(function (heading) {
            var step = document.createElement('section');
            step.className = 'form-step';
            heading.parentNode.insertBefore(step, heading);

            var element = heading;
            while (element) {
                var next = element.nextElementSibling;
                if (element !== heading && element.tagName === 'H3') break;
                if (element.tagName === 'HR') {
                    element.remove();
                } else {
                    step.appendChild(element);
                }
                element = next;
            }
            steps.push(step);
        });
    }

    function buildHealthSteps() {
        steps = Array.prototype.slice.call(form.children).filter(function (element) {
            return element.tagName === 'SECTION';
        });
        steps.forEach(function (step) {
            step.classList.add('form-step');
        });
        Array.prototype.slice.call(form.children).forEach(function (element) {
            if (element.tagName === 'HR') element.remove();
        });
    }

    if (flowType === 'sleep') {
        buildSleepSteps();
    } else {
        buildHealthSteps();
    }
    if (!steps.length || !privacy || !privacyCheckbox || !submitButton) return;

    var progress = document.createElement('div');
    progress.className = 'form-progress';
    progress.innerHTML = '<div class="form-progress-track" aria-hidden="true"><span></span></div><p aria-live="polite"></p>';
    var progressBar = progress.querySelector('span');
    var progressText = progress.querySelector('p');
    form.insertBefore(progress, steps[0]);

    var controls = document.createElement('div');
    controls.className = 'form-flow-controls';
    var previousButton = document.createElement('button');
    previousButton.type = 'button';
    previousButton.className = 'form-flow-back';
    previousButton.textContent = 'Назад';
    var nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'form-flow-next';
    nextButton.textContent = 'Продолжить';

    submitButton.removeAttribute('style');
    submitButton.classList.add('form-flow-submit');
    privacy.parentNode.removeChild(privacy);
    submitButton.parentNode.removeChild(submitButton);
    form.appendChild(privacy);
    controls.appendChild(previousButton);
    controls.appendChild(nextButton);
    controls.appendChild(submitButton);
    form.appendChild(controls);

    var privacyError = document.createElement('p');
    privacyError.className = 'form-privacy-error';
    privacyError.id = 'privacyError';
    privacyError.setAttribute('role', 'alert');
    privacyCheckbox.setAttribute('aria-describedby', 'privacyError');
    privacy.appendChild(privacyError);

    function setFrequencyVisibility(checkbox, field) {
        field.hidden = !checkbox.checked;
        field.disabled = !checkbox.checked;
        checkbox.setAttribute('aria-expanded', checkbox.checked ? 'true' : 'false');
    }

    function enhanceFoodFrequency() {
        if (flowType !== 'health') return;
        var group = form.querySelector('.checkbox-group.soft-style');
        if (!group) return;
        Array.prototype.slice.call(group.querySelectorAll('.custom-checkbox input[type="checkbox"]')).forEach(function (checkbox) {
            var field = checkbox.closest('label').nextElementSibling;
            if (!field || !field.matches('input.light-input')) return;
            field.classList.add('conditional-frequency');
            setFrequencyVisibility(checkbox, field);
            checkbox.addEventListener('change', function () {
                setFrequencyVisibility(checkbox, field);
            });
        });
    }

    function enhanceConditionalFields() {
        if (flowType !== 'health') return;
        Array.prototype.slice.call(form.querySelectorAll('[data-conditional-field]')).forEach(function (group) {
            var field = document.getElementById(group.getAttribute('data-conditional-field'));
            var expectedValue = group.getAttribute('data-conditional-value');
            if (!field || !expectedValue) return;

            var inputs = Array.prototype.slice.call(field.querySelectorAll('input, textarea, select'));
            var radios = Array.prototype.slice.call(group.querySelectorAll('input[type="radio"]'));

            function updateVisibility() {
                var selected = group.querySelector('input[type="radio"]:checked');
                var isVisible = Boolean(selected && selected.value === expectedValue);
                field.hidden = !isVisible;
                inputs.forEach(function (input) {
                    input.disabled = !isVisible;
                });
            }

            radios.forEach(function (radio) {
                radio.addEventListener('change', updateVisibility);
            });
            updateVisibility();
        });
    }

    function validateCurrentStep() {
        var fields = Array.prototype.slice.call(steps[currentStep].querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'));
        for (var index = 0; index < fields.length; index += 1) {
            if (!fields[index].checkValidity()) {
                fields[index].reportValidity();
                return false;
            }
        }
        return true;
    }

    function validatePrivacy() {
        if (privacyCheckbox.checked) {
            privacyCheckbox.removeAttribute('aria-invalid');
            privacyError.textContent = '';
            return true;
        }
        privacyCheckbox.setAttribute('aria-invalid', 'true');
        privacyError.textContent = 'Подтвердите согласие на обработку персональных данных.';
        var label = privacyCheckbox.closest('.privacy-checkbox');
        if (label) {
            label.classList.remove('shake');
            void label.offsetWidth;
            label.classList.add('shake');
        }
        return false;
    }

    function showStep(index, moveFocus) {
        currentStep = index;
        steps.forEach(function (step, stepIndex) {
            step.hidden = stepIndex !== currentStep;
        });
        var isLastStep = currentStep === steps.length - 1;
        privacy.hidden = !isLastStep;
        previousButton.hidden = currentStep === 0;
        nextButton.hidden = isLastStep;
        submitButton.hidden = !isLastStep;
        progressBar.style.width = ((currentStep + 1) / steps.length * 100) + '%';
        progressText.textContent = 'Раздел ' + (currentStep + 1) + ' из ' + steps.length;

        if (moveFocus) {
            var heading = steps[currentStep].querySelector('h3');
            if (heading) {
                heading.setAttribute('tabindex', '-1');
                heading.focus();
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    nextButton.addEventListener('click', function () {
        if (validateCurrentStep()) showStep(currentStep + 1, true);
    });

    previousButton.addEventListener('click', function () {
        showStep(currentStep - 1, true);
    });

    privacyCheckbox.addEventListener('change', function () {
        if (privacyCheckbox.checked) {
            privacyCheckbox.removeAttribute('aria-invalid');
            privacyError.textContent = '';
        }
    });

    form.addEventListener('submit', function (event) {
        if (currentStep < steps.length - 1) {
            event.preventDefault();
            if (validateCurrentStep()) showStep(currentStep + 1, true);
            return;
        }
        if (!validateCurrentStep() || !validatePrivacy()) {
            event.preventDefault();
            return;
        }
        if (flowType === 'health') {
            var nameField = form.querySelector('input[name="Имя и фамилия клиента"]');
            var subject = form.querySelector('input[name="subject"]');
            if (nameField && subject && nameField.value.trim()) {
                subject.value = 'Анкета здоровья — ' + nameField.value.trim();
            }
        }
    });

    enhanceFoodFrequency();
    enhanceConditionalFields();
    form.classList.add('is-stepped');
    document.body.classList.add('js-ready');
    showStep(0, false);
}());
