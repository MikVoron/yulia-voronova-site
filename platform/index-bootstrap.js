		(function primeGuestTourVisibility() {
			let showGuestTour = new URLSearchParams(location.search).get('guestTour') === '1';
			if (!showGuestTour) {
				try {
					showGuestTour = localStorage.getItem('smartplate_guest_tour_completed_v1') !== '1';
				} catch (_) {
					showGuestTour = true;
				}
			}
			if (showGuestTour) document.documentElement.classList.add('sp-guest-tour-preview');
		})();
