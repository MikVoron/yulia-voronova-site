(function () {
    'use strict';

    var form = document.getElementById('childQuestionnaireForm');
    if (!form) return;

    var steps = Array.prototype.slice.call(form.querySelectorAll('.child-step'));
    var backButton = document.getElementById('childBack');
    var nextButton = document.getElementById('childNext');
    var submitButton = document.getElementById('childSubmit');
    var progressBar = document.getElementById('childProgressBar');
    var progressText = document.getElementById('childProgressText');
    var currentStep = 0;

    document.body.classList.add('js-ready');

    function updateRevealedFields() {
        Array.prototype.forEach.call(form.querySelectorAll('[data-reveals]'), function (control) {
            var field = document.getElementById(control.getAttribute('data-reveals'));
            if (!field) return;
            field.disabled = !control.checked;
            field.classList.toggle('is-visible', control.checked);
            if (!control.checked) field.value = '';
        });
    }

    function validateChoiceGroups(step) {
        var valid = true;
        Array.prototype.forEach.call(step.querySelectorAll('[data-required-choice]'), function (group) {
            var name = group.getAttribute('data-required-choice');
            var hasChoice = group.querySelector('input[type="checkbox"]:checked');
            var message = form.querySelector('[data-choice-error="' + name + '"]');
            if (message) message.textContent = hasChoice ? '' : 'Выберите хотя бы один вариант.';
            group.classList.toggle('has-error', !hasChoice);
            if (!hasChoice) valid = false;
        });
        return valid;
    }

    function validateRadioGroups(step) {
        var valid = true;
        Array.prototype.forEach.call(step.querySelectorAll('[data-required-radio]'), function (group) {
            var name = group.getAttribute('data-required-radio');
            var hasChoice = group.querySelector('input[type="radio"]:checked');
            var message = form.querySelector('[data-radio-error="' + name + '"]');
            if (message) message.textContent = hasChoice ? '' : 'Выберите один вариант.';
            group.classList.toggle('has-error', !hasChoice);
            if (!hasChoice) valid = false;
        });
        return valid;
    }

    function validatePrivacy(step) {
        var checkbox = document.getElementById('privacyCheck');
        if (!checkbox || !step.contains(checkbox) || checkbox.checked) {
            if (checkbox) checkbox.removeAttribute('aria-invalid');
            return true;
        }
        var label = checkbox.closest('.privacy-checkbox');
        var message = document.getElementById('privacyError');
        checkbox.setAttribute('aria-invalid', 'true');
        if (message) message.textContent = 'Подтвердите согласие на обработку персональных данных.';
        if (label) {
            label.classList.remove('shake');
            void label.offsetWidth;
            label.classList.add('shake');
        }
        return false;
    }

    function validateStep(step) {
        updateRevealedFields();
        var valid = validateChoiceGroups(step) && validateRadioGroups(step) && validatePrivacy(step);
        var fields = Array.prototype.slice.call(step.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'));
        for (var i = 0; i < fields.length; i += 1) {
            if (!fields[i].checkValidity()) {
                fields[i].reportValidity();
                return false;
            }
        }
        return valid;
    }

    function showStep(index, moveFocus) {
        currentStep = index;
        steps.forEach(function (step, stepIndex) {
            step.hidden = stepIndex !== currentStep;
        });
        backButton.hidden = currentStep === 0;
        nextButton.hidden = currentStep === steps.length - 1;
        submitButton.hidden = currentStep !== steps.length - 1;
        progressBar.style.width = ((currentStep + 1) / steps.length * 100) + '%';
        progressText.textContent = 'Раздел ' + (currentStep + 1) + ' из ' + steps.length;
        if (moveFocus) {
            var heading = steps[currentStep].querySelector('legend');
            if (heading) {
                heading.setAttribute('tabindex', '-1');
                heading.focus();
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    form.addEventListener('change', function (event) {
        if (event.target.matches('[data-reveals]')) updateRevealedFields();
        var choiceGroup = event.target.closest('[data-required-choice]');
        if (choiceGroup && event.target.checked) {
            choiceGroup.classList.remove('has-error');
            var error = form.querySelector('[data-choice-error="' + choiceGroup.getAttribute('data-required-choice') + '"]');
            if (error) error.textContent = '';
        }
        if (event.target.id === 'privacyCheck' && event.target.checked) {
            event.target.removeAttribute('aria-invalid');
            var privacyError = document.getElementById('privacyError');
            if (privacyError) privacyError.textContent = '';
        }
    });

    nextButton.addEventListener('click', function () {
        if (validateStep(steps[currentStep])) showStep(currentStep + 1, true);
    });

    backButton.addEventListener('click', function () {
        showStep(currentStep - 1, true);
    });

    form.addEventListener('submit', function (event) {
        if (!validateStep(steps[currentStep])) event.preventDefault();
    });

    updateRevealedFields();
    showStep(0, false);
}());
