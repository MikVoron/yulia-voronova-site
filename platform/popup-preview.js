		function showPreviewToast(message) {
			let el = document.getElementById('v2-toast');
			if (!el) {
				el = document.createElement('div');
				el.id = 'v2-toast';
				document.body.appendChild(el);
			}
			el.textContent = message;
			el.classList.add('show');
			clearTimeout(el._t);
			el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
		}
		function showLockedPreview() {
			const existing = document.getElementById('locked-toast');
			if (existing) existing.remove();
			const toast = document.createElement('div');
			toast.id = 'locked-toast';
			toast.className = 'locked-toast';
			toast.innerHTML = 'Этот рецепт доступен по подписке. <a class="locked-toast-link" href="#">Оформить</a>';
			document.body.appendChild(toast);
			requestAnimationFrame(function () { toast.classList.add('show'); });
			setTimeout(function () {
				toast.classList.remove('show');
				setTimeout(function () { toast.remove(); }, 250);
			}, 4200);
		}
		function openModal(id) {
			const el = document.getElementById(id);
			if (el) el.classList.add(id === 'plate-preview' ? 'open' : 'show');
		}
		function closeModal(id) {
			const el = document.getElementById(id);
			if (!el) return;
			el.classList.remove('show');
			el.classList.remove('open');
		}
		document.addEventListener('keydown', function (e) {
			if (e.key !== 'Escape') return;
			['balance-modal', 'warn-modal', 'plate-preview'].forEach(closeModal);
		});
