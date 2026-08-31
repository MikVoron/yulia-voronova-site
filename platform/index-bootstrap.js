		(function primeGuestTourVisibility() {
			const showGuestTour = new URLSearchParams(location.search).get('guestTour') === '1';
			if (showGuestTour) document.documentElement.classList.add('sp-guest-tour-preview');
		})();
