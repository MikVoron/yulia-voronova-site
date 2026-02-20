// Burger Menu Toggle
document.addEventListener('DOMContentLoaded', () => {
    const burgerMenu = document.querySelector('.burger-menu');
    const nav = document.querySelector('.nav');
    const navClose = document.querySelector('.nav-close');
    const body = document.body;

    if (burgerMenu && nav) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        document.body.appendChild(overlay);

        // Функция закрытия меню
        const closeMenu = () => {
            burgerMenu.classList.remove('active');
            nav.classList.remove('active');
            overlay.classList.remove('active');
            body.style.overflow = '';
        };

        // Открыть меню
        burgerMenu.addEventListener('click', () => {
            burgerMenu.classList.toggle('active');
            nav.classList.toggle('active');
            overlay.classList.toggle('active');
            body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
        });

        // Закрыть по кнопке X
        if (navClose) {
            navClose.addEventListener('click', closeMenu);
        }

        // Close menu on overlay click
        overlay.addEventListener('click', closeMenu);

        // Close menu on nav link click (only <a> elements, not the dropdown button)
        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', closeMenu);
        });
    }

    // Chat Launcher Widget
    const chatLauncher = document.getElementById('chatLauncher');
    const chatLauncherBtn = document.getElementById('chatLauncherBtn');
    const tawkOpenBtn = document.getElementById('tawkOpenBtn');

    if (chatLauncher && chatLauncherBtn) {
        // Открыть/закрыть меню
        chatLauncherBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = chatLauncher.classList.toggle('open');
            chatLauncherBtn.setAttribute('aria-expanded', isOpen);
            document.getElementById('chatOptions').setAttribute('aria-hidden', !isOpen);
        });

        // Закрыть при клике вне виджета
        document.addEventListener('click', (e) => {
            if (!chatLauncher.contains(e.target)) {
                chatLauncher.classList.remove('open');
                chatLauncherBtn.setAttribute('aria-expanded', 'false');
                document.getElementById('chatOptions').setAttribute('aria-hidden', 'true');
            }
        });

        // Открыть чат tawk.to через API
        if (tawkOpenBtn) {
            tawkOpenBtn.addEventListener('click', () => {
                chatLauncher.classList.remove('open');
                chatLauncherBtn.setAttribute('aria-expanded', 'false');
                // Сбрасываем оба бейджа при открытии чата
                const badge = document.getElementById('chatBadge');
                if (badge) badge.classList.remove('visible');
                const tawkBadge = document.getElementById('tawkBadge');
                if (tawkBadge) tawkBadge.classList.remove('visible');
                if (typeof Tawk_API !== 'undefined' && typeof Tawk_API.maximize === 'function') {
                    Tawk_API.maximize();
                }
            });
        }
    }

    // Dropdown toggle — click/touch support
    const dropdownToggle = document.querySelector('.nav-dropdown-toggle');
    const navDropdown = document.querySelector('.nav-dropdown');
    if (dropdownToggle && navDropdown) {
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = navDropdown.classList.toggle('open');
            dropdownToggle.setAttribute('aria-expanded', isOpen);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            navDropdown.classList.remove('open');
            dropdownToggle.setAttribute('aria-expanded', 'false');
        });

        // Close dropdown when a menu link is clicked
        navDropdown.querySelectorAll('.nav-dropdown-menu a').forEach(link => {
            link.addEventListener('click', () => {
                navDropdown.classList.remove('open');
                dropdownToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Tariffs card selection on desktop - switch border on click
document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth > 768) {
        const tariffCards = document.querySelectorAll('.tariffs-grid .tariff-card-collapsible');

        if (tariffCards.length > 0) {
            tariffCards.forEach(card => {
                card.addEventListener('click', (e) => {
                    // Don't switch if clicking on a link/button
                    if (e.target.closest('a, button')) return;

                    // Remove popular from all cards
                    tariffCards.forEach(c => c.classList.remove('popular'));

                    // Add popular to clicked card
                    card.classList.add('popular');
                });
            });
        }
    }
});

// Tariffs carousel - scroll to middle card (КОНСУЛЬТАЦИЯ 1+1) on mobile
// Tariffs Stack Carousel - стопка карточек
document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth <= 768) {
        const tariffsGrid = document.querySelector('.tariffs-grid');
        const leftArrow = document.querySelector('.tariffs-arrow-left');
        const rightArrow = document.querySelector('.tariffs-arrow-right');
        const cards = document.querySelectorAll('.tariff-card-collapsible');
        const dots = document.querySelectorAll('.tariff-dot');

        if (tariffsGrid && cards.length > 0) {
            let currentIndex = 1; // Начинаем с карточки 1+1 (средняя)

            // Функция обновления стопки карточек
            const updateStack = (index) => {
                if (index < 0) index = 0;
                if (index >= cards.length) index = cards.length - 1;
                currentIndex = index;

                // Закрываем все открытые карточки при смене
                if (typeof window.closeAllTariffCards === 'function') {
                    window.closeAllTariffCards();
                }

                cards.forEach((card, i) => {
                    // Убираем все классы
                    card.classList.remove('active', 'stack-back-1', 'stack-back-2');

                    if (i === currentIndex) {
                        // Активная карточка
                        card.classList.add('active');
                    } else if (i === currentIndex - 1 || i === currentIndex + 1) {
                        // Соседние карточки - первый уровень стопки
                        card.classList.add('stack-back-1');
                    } else {
                        // Дальние карточки - второй уровень стопки
                        card.classList.add('stack-back-2');
                    }
                });

                // Обновляем точки
                dots.forEach((dot, i) => {
                    dot.classList.toggle('active', i === currentIndex);
                });

                updateArrowsState();
            };

            // Обновление состояния стрелок
            const updateArrowsState = () => {
                if (leftArrow) {
                    leftArrow.classList.toggle('disabled', currentIndex <= 0);
                }
                if (rightArrow) {
                    rightArrow.classList.toggle('disabled', currentIndex >= cards.length - 1);
                }
            };

            // Клик по точкам
            dots.forEach((dot, i) => {
                dot.addEventListener('click', () => {
                    updateStack(i);
                });
            });

            // Начальное состояние
            updateStack(currentIndex);

            // Обработчики стрелок
            if (leftArrow) {
                leftArrow.addEventListener('click', () => {
                    if (currentIndex > 0) {
                        updateStack(currentIndex - 1);
                    }
                });
            }

            if (rightArrow) {
                rightArrow.addEventListener('click', () => {
                    if (currentIndex < cards.length - 1) {
                        updateStack(currentIndex + 1);
                    }
                });
            }

            // Свайп отключен - навигация только стрелками

            // Показываем/скрываем стрелки при видимости секции тарифов
            // Стрелки появляются когда карточки видны на экране
            const tariffsSection = document.querySelector('.tariffs');
            if (tariffsSection && 'IntersectionObserver' in window) {
                const arrowsObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        tariffsSection.classList.toggle('arrows-visible', entry.isIntersecting);
                    });
                }, {
                    threshold: 0.3
                });
                arrowsObserver.observe(tariffsGrid);
            }
        }
    }
});

// Diplomas Carousel
document.addEventListener('DOMContentLoaded', () => {
    const diplomasGrid = document.querySelector('.diplomas-grid');
    const leftArrow = document.querySelector('.diplomas-arrow-left');
    const rightArrow = document.querySelector('.diplomas-arrow-right');

    if (diplomasGrid && leftArrow && rightArrow) {
        const cards = diplomasGrid.querySelectorAll('.diploma-card');
        let currentIndex = 0;

        const scrollToCard = (index) => {
            if (index < 0) index = 0;
            if (index >= cards.length) index = cards.length - 1;
            currentIndex = index;

            const card = cards[index];
            const cardLeftInGrid = card.offsetLeft;
            const cardWidth = card.offsetWidth;
            const gridWidth = diplomasGrid.offsetWidth;
            const targetScroll = cardLeftInGrid - (gridWidth - cardWidth) / 2;

            cards.forEach((c, i) => {
                if (i === index) {
                    c.classList.add('active');
                } else {
                    c.classList.remove('active');
                }
            });

            diplomasGrid.scrollTo({
                left: targetScroll,
                behavior: 'smooth'
            });

            updateArrowsState(index);
        };

        const updateArrowsState = (index) => {
            leftArrow.classList.toggle('disabled', index === 0);
            rightArrow.classList.toggle('disabled', index === cards.length - 1);
        };

        // Инициализация - вторая карточка активна и центрирована
        if (cards.length > 1) {
            currentIndex = 1;
            cards[1].classList.add('active');
            updateArrowsState(1);
            // Центрируем вторую карточку после загрузки
            setTimeout(() => {
                scrollToCard(1);
            }, 100);
        }

        leftArrow.addEventListener('click', () => {
            if (!leftArrow.classList.contains('disabled')) {
                scrollToCard(currentIndex - 1);
            }
        });

        rightArrow.addEventListener('click', () => {
            if (!rightArrow.classList.contains('disabled')) {
                scrollToCard(currentIndex + 1);
            }
        });

        // Обновление при скролле
        let scrollTimeout;
        diplomasGrid.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const gridWidth = diplomasGrid.offsetWidth;
                const scrollLeft = diplomasGrid.scrollLeft;
                const centerPoint = scrollLeft + gridWidth / 2;

                let closestIndex = 0;
                let closestDistance = Infinity;

                cards.forEach((card, index) => {
                    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
                    const distance = Math.abs(centerPoint - cardCenter);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = index;
                    }
                });

                if (closestIndex !== currentIndex) {
                    currentIndex = closestIndex;
                    cards.forEach((c, i) => {
                        c.classList.toggle('active', i === currentIndex);
                    });
                    updateArrowsState(currentIndex);
                }
            }, 100);
        });
    }
});

// Animate elements on scroll (Intersection Observer)
document.addEventListener('DOMContentLoaded', () => {
    const stepItems = document.querySelectorAll('.first-meeting-v4 .step-item');

    if (stepItems.length > 0 && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.2,
            rootMargin: '0px 0px -50px 0px'
        });

        stepItems.forEach(item => {
            observer.observe(item);
        });
    }
});

// Scroll animations for sections (Services Range, FAQ, Telegram Subscribe)
document.addEventListener('DOMContentLoaded', () => {
    const animatedSections = document.querySelectorAll('.services-range, .faq, .telegram-subscribe');

    if (animatedSections.length > 0 && 'IntersectionObserver' in window) {
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-visible');
                    sectionObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });

        animatedSections.forEach(section => {
            sectionObserver.observe(section);
        });
    }
});

// Scroll animations for About page sections
document.addEventListener('DOMContentLoaded', () => {
    const aboutSections = document.querySelectorAll('.about-help-section, .about-youtube-section, .diplomas');

    if (aboutSections.length > 0 && 'IntersectionObserver' in window) {
        const aboutObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-visible');
                    aboutObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });

        aboutSections.forEach(section => {
            aboutObserver.observe(section);
        });
    }
});

// Active link highlighting based on scroll position
function updateActiveLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav a:not(.nav-dropdown-toggle):not(.nav-dropdown-menu a), .footer-nav a');

    let currentSection = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop - 150;
        const sectionHeight = section.offsetHeight;

        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
            currentSection = section.getAttribute('id');
        }
    });

    // На страницах, не являющихся главной — не трогаем active вообще
    var isMainPage = window.location.pathname === '/' || window.location.pathname === '/index.html' || window.location.pathname.endsWith('/index.html');

    navLinks.forEach(link => {
        var href = link.getAttribute('href');

        // Не трогаем ссылки на другие страницы (about.html, blog.html и т.д.)
        if (!href.startsWith('#') && !href.startsWith('/#')) {
            return;
        }

        // Ссылки вида /#section — обрабатываем только на главной
        if (href.startsWith('/#')) {
            if (!isMainPage) return;
            link.classList.remove('active');
            if (currentSection && href === '/#' + currentSection) {
                link.classList.add('active');
            }
            return;
        }

        // Ссылки вида #section — обрабатываем только если есть секции на странице
        if (href.startsWith('#') && href.length > 1) {
            link.classList.remove('active');
            if (currentSection && href === '#' + currentSection) {
                link.classList.add('active');
            }
        }
    });
}

// Update active link on scroll
window.addEventListener('scroll', updateActiveLink);

// Update active link on page load
document.addEventListener('DOMContentLoaded', updateActiveLink);

// Testimonials navigation
let currentTestimonial = 0;
const testimonials = document.querySelectorAll('.testimonial-card');
const prevBtn = document.querySelector('.nav-btn.prev');
const nextBtn = document.querySelector('.nav-btn.next');

if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
        currentTestimonial = (currentTestimonial - 1 + testimonials.length) % testimonials.length;
        updateTestimonials();
    });

    nextBtn.addEventListener('click', () => {
        currentTestimonial = (currentTestimonial + 1) % testimonials.length;
        updateTestimonials();
    });
}

function updateTestimonials() {
    // This would implement carousel logic if needed
    console.log('Current testimonial:', currentTestimonial);
}

// Newsletter form submission
const newsletterForm = document.querySelector('.newsletter-form');
if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(newsletterForm);
        alert('Thank you for subscribing!');
        newsletterForm.reset();
    });
}

// Animation on scroll - Combined observer for all elements
document.addEventListener('DOMContentLoaded', () => {
    const gridItems = document.querySelectorAll('.grid-item');

    // Force hide all grid items first
    gridItems.forEach(item => {
        item.classList.add('hidden');
    });

    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    };

    const animateOnScroll = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // For grid items - add animate class
                if (entry.target.classList.contains('grid-item')) {
                    entry.target.classList.add('animate');
                    // Unobserve after animation to prevent re-triggering
                    setTimeout(() => {
                        animateOnScroll.unobserve(entry.target);
                    }, 1000);
                } else {
                    // For other elements - fade in
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            }
        });
    }, observerOptions);

    // Observe grid items
    gridItems.forEach(item => {
        animateOnScroll.observe(item);
    });

    // Mobile tap toggle for grid items
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        gridItems.forEach(item => {
            item.addEventListener('click', function(e) {
                // Не срабатываем на ссылках
                if (e.target.closest('a')) return;

                e.stopPropagation();

                // Toggle active class
                if (this.classList.contains('tapped')) {
                    this.classList.remove('tapped');
                } else {
                    // Remove tapped from all other items
                    gridItems.forEach(i => i.classList.remove('tapped'));
                    this.classList.add('tapped');
                }
            });
        });

        // Close on tap outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.grid-item')) {
                gridItems.forEach(i => i.classList.remove('tapped'));
            }
        });
    }

    // Observe other elements for fade-in animation
    document.querySelectorAll('.testimonial-card, .booking-info').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        animateOnScroll.observe(el);
    });

    // Telegram chat animation - delayed after load to avoid PageSpeed impact
    const tgChatSection = document.querySelector('.tg-chat-section');
    if (tgChatSection) {
        tgChatSection.classList.add('animate-visible');

        window.addEventListener('load', () => {
            setTimeout(() => {
                const msgs = tgChatSection.querySelectorAll('.tg-msg');
                msgs.forEach(msg => msg.classList.add('tg-msg-ready'));

                const msgObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const msg = entry.target;
                            const idx = Array.from(msgs).indexOf(msg);
                            setTimeout(() => msg.classList.add('tg-msg-visible'), idx * 150);
                            msgObserver.unobserve(msg);
                        }
                    });
                }, { threshold: 0.1 });

                msgs.forEach(msg => msgObserver.observe(msg));
            }, 2000);
        });
    }
});

// Time slot selection
const timeSlots = document.querySelectorAll('.time-slot');
timeSlots.forEach(slot => {
    slot.addEventListener('click', () => {
        timeSlots.forEach(s => s.classList.remove('selected'));
        slot.classList.add('selected');
    });
});

// Header scroll effect
let lastScroll = 0;
const header = document.querySelector('.header');

window.addEventListener('scroll', () => {
    if (!header) return;
    const currentScroll = window.pageYOffset;

    if (currentScroll > lastScroll && currentScroll > 100) {
        header.style.transform = 'translateY(-100%)';
    } else {
        header.style.transform = 'translateY(0)';
    }

    lastScroll = currentScroll;
});

// Переключение вариантов First Meeting (для тестирования)
// Раскомментируйте нужную секцию в HTML, убрав style="display: none;"
// Варианты: .first-meeting-v1, .first-meeting-v2, .first-meeting-v3

// Tariff card expand/collapse functionality (Variant 1)
document.addEventListener('DOMContentLoaded', function() {

    // Инициализация: присваиваем уникальные ID и ЯВНО закрываем все карточки
    const allCards = document.querySelectorAll('.tariff-card-collapsible');
    const tariffsGrid = document.querySelector('.tariffs-grid');
    console.log('Found cards:', allCards.length);

    allCards.forEach((card, index) => {
        card.setAttribute('data-card-id', index);
        card.classList.remove('is-open');
        const details = card.querySelector('.tariff-details');
        if (details) {
            details.classList.remove('is-visible');
        }
    });

    // Переменная для отслеживания открытой карточки
    let currentlyOpenCardId = null;

    // Функция закрытия всех карточек
    function closeAllCards() {
        document.querySelectorAll('.tariff-card-collapsible').forEach((card) => {
            const details = card.querySelector('.tariff-details');
            const btn = card.querySelector('.expand-indicator-line');
            const lineText = btn ? btn.querySelector('.line-text') : null;

            card.classList.remove('is-open');
            if (details) {
                details.classList.remove('is-visible');
            }
            if (btn) {
                btn.classList.remove('expanded');
            }
            if (lineText) {
                lineText.textContent = 'Подробнее';
            }
        });
        
        // Убираем класс с grid
        if (tariffsGrid) {
            tariffsGrid.classList.remove('has-open-card');
        }
        
        currentlyOpenCardId = null;
    }

    // Экспортируем функцию для использования в carousel
    window.closeAllTariffCards = closeAllCards;

    // Функция переключения карточки
    function toggleCard(clickedCard) {
        if (!clickedCard) return;

        const clickedCardId = clickedCard.getAttribute('data-card-id');
        const clickedDetails = clickedCard.querySelector('.tariff-details');
        const clickedBtn = clickedCard.querySelector('.expand-indicator-line');
        const clickedLineText = clickedBtn ? clickedBtn.querySelector('.line-text') : null;

        // Проверяем, является ли эта карточка уже открытой
        const isThisCardOpen = (currentlyOpenCardId === clickedCardId);

        // СНАЧАЛА закрываем ВСЕ карточки
        closeAllCards();

        // Если карточка была открыта и мы её закрываем - прокручиваем к секции тарифов
        if (isThisCardOpen && window.innerWidth <= 768) {
            const tariffsSection = document.querySelector('.tariffs') || document.getElementById('tariffs');
            if (tariffsSection) {
                setTimeout(() => {
                    tariffsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }

        // ПОТОМ, если нужно, открываем только нажатую карточку
        if (!isThisCardOpen) {
            clickedCard.classList.add('is-open');
            if (clickedDetails) {
                clickedDetails.classList.add('is-visible');
            }
            if (clickedBtn) {
                clickedBtn.classList.add('expanded');
            }
            if (clickedLineText) {
                clickedLineText.textContent = 'Свернуть';
            }
            currentlyOpenCardId = clickedCardId;
            
            // Добавляем класс на grid
            if (tariffsGrid) {
                tariffsGrid.classList.add('has-open-card');
            }
            
            // Прокручиваем к карточке на мобильном
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    clickedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }
    }

    // Обработчик клика на всю карточку (кроме кнопки записаться)
    allCards.forEach((card) => {
        card.addEventListener('click', function(e) {
            // Не срабатываем на кнопке "Записаться"
            if (e.target.closest('.btn-tariff-fixed')) {
                return;
            }
            toggleCard(this);
        });
    });
});

// Tabs functionality (Variant 5)
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const targetTab = this.getAttribute('data-tab');

        // Remove active class from all buttons and panels
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        // Add active class to clicked button and corresponding panel
        this.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
    });
});

// Filter functionality (Variant 6)
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const filter = this.getAttribute('data-filter');

        // Remove active class from all filter buttons
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // Filter cards
        document.querySelectorAll('.filter-card').forEach(card => {
            const category = card.getAttribute('data-category');

            if (filter === 'all') {
                card.classList.remove('hidden');
            } else if (category === filter) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    });
});

// FAQ Accordion functionality
document.addEventListener('DOMContentLoaded', function() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', function() {
            const isActive = item.classList.contains('active');

            // Закрываем все открытые вопросы
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
            });

            // Открываем нажатый вопрос (если он был закрыт)
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
});

// Diploma Modal functionality
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('diploma-modal');
    const modalImg = document.getElementById('diploma-modal-image');
    const closeBtn = document.querySelector('.diploma-modal-close');
    const prevBtn = document.querySelector('.diploma-modal-prev');
    const nextBtn = document.querySelector('.diploma-modal-next');
    const diplomaCards = document.querySelectorAll('.diploma-card');

    if (!modal || !modalImg || !closeBtn || !prevBtn || !nextBtn || diplomaCards.length === 0) {
        return;
    }

    let currentDiplomaIndex = 0;
    const diplomaImages = Array.from(diplomaCards).map(card => card.getAttribute('data-diploma'));

    // Open modal when clicking on diploma card
    diplomaCards.forEach((card, index) => {
        card.addEventListener('click', function() {
            currentDiplomaIndex = index;
            openModal();
        });
    });

    function openModal() {
        modal.classList.add('active');
        modalImg.src = diplomaImages[currentDiplomaIndex];
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function showPrevDiploma() {
        currentDiplomaIndex = (currentDiplomaIndex - 1 + diplomaImages.length) % diplomaImages.length;
        modalImg.src = diplomaImages[currentDiplomaIndex];
    }

    function showNextDiploma() {
        currentDiplomaIndex = (currentDiplomaIndex + 1) % diplomaImages.length;
        modalImg.src = diplomaImages[currentDiplomaIndex];
    }

    // Close modal
    closeBtn.addEventListener('click', closeModal);

    // Click outside image to close
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Navigation buttons
    prevBtn.addEventListener('click', showPrevDiploma);
    nextBtn.addEventListener('click', showNextDiploma);

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (!modal.classList.contains('active')) return;

        if (e.key === 'Escape') {
            closeModal();
        } else if (e.key === 'ArrowLeft') {
            showPrevDiploma();
        } else if (e.key === 'ArrowRight') {
            showNextDiploma();
        }
    });
});

// Testimonials Carousel functionality
document.addEventListener('DOMContentLoaded', function() {
    const track = document.querySelector('.testimonials-carousel-track');
    const prevBtn = document.querySelector('.carousel-btn-prev');
    const nextBtn = document.querySelector('.carousel-btn-next');
    const dotsContainer = document.querySelector('.carousel-dots');

    if (!track) return;

    const cards = track.querySelectorAll('.social-testimonial-card');
    const totalCards = cards.length;
    let currentIndex = 0;
    let cardsPerView = getCardsPerView();

    function getCardsPerView() {
        if (window.innerWidth <= 480) return 1;
        if (window.innerWidth <= 768) return 2;
        return 3;
    }

    // Create dots
    function createDots() {
        if (!dotsContainer) return;
        dotsContainer.innerHTML = '';
        const slidesCount = Math.ceil(totalCards / getCardsPerView());
        for (let i = 0; i < slidesCount; i++) {
            const dot = document.createElement('button');
            dot.classList.add('carousel-dot');
            if (i === 0) dot.classList.add('active');
            dot.setAttribute('aria-label', `Перейти к слайду ${i + 1}`);
            dot.addEventListener('click', () => goToSlide(i));
            dotsContainer.appendChild(dot);
        }
    }

    function updateDots() {
        if (!dotsContainer) return;
        const dots = dotsContainer.querySelectorAll('.carousel-dot');
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentIndex);
        });
    }

    function updateCarousel() {
        const cardWidth = cards[0].offsetWidth;
        const gap = 30; // gap from CSS
        const offset = currentIndex * (cardWidth + gap) * cardsPerView;
        track.style.transform = `translateX(-${offset}px)`;
        updateDots();

        // Update button states
        if (prevBtn) prevBtn.disabled = currentIndex === 0;
        if (nextBtn) {
            const maxIndex = Math.ceil(totalCards / cardsPerView) - 1;
            nextBtn.disabled = currentIndex >= maxIndex;
        }
    }

    function goToSlide(index) {
        const maxIndex = Math.ceil(totalCards / cardsPerView) - 1;
        currentIndex = Math.max(0, Math.min(index, maxIndex));
        updateCarousel();
    }

    function nextSlide() {
        const maxIndex = Math.ceil(totalCards / cardsPerView) - 1;
        if (currentIndex < maxIndex) {
            currentIndex++;
            updateCarousel();
        }
    }

    function prevSlide() {
        if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
        }
    }

    // Event listeners
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);
    if (nextBtn) nextBtn.addEventListener('click', nextSlide);

    // Touch/swipe support for mobile
    let touchStartX = 0;
    let touchEndX = 0;

    track.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                nextSlide();
            } else {
                prevSlide();
            }
        }
    }

    // Recalculate on resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const newCardsPerView = getCardsPerView();
            if (newCardsPerView !== cardsPerView) {
                cardsPerView = newCardsPerView;
                currentIndex = 0;
                createDots();
            }
            updateCarousel();
        }, 150);
    });

    // Initialize
    createDots();
    updateCarousel();
});

// Testimonial Modal functionality with navigation
document.addEventListener('DOMContentLoaded', function() {
    const testimonialModal = document.getElementById('testimonial-modal');
    const testimonialModalImg = document.getElementById('testimonial-modal-image');
    const testimonialCloseBtn = document.querySelector('.testimonial-modal-close');
    const testimonialPrevBtn = document.querySelector('.testimonial-modal-prev');
    const testimonialNextBtn = document.querySelector('.testimonial-modal-next');
    const testimonialCards = document.querySelectorAll('.social-testimonial-card');

    // Info card elements
    const infoName = document.getElementById('testimonial-info-name');
    const infoAge = document.getElementById('testimonial-info-age');
    const infoRequest = document.getElementById('testimonial-info-request');

    if (!testimonialModal || !testimonialModalImg) return;

    let currentTestimonialIndex = 0;
    const testimonialData = Array.from(testimonialCards).map(card => ({
        image: card.getAttribute('data-testimonial'),
        name: card.getAttribute('data-name') || '',
        age: card.getAttribute('data-age') || '',
        request: card.getAttribute('data-request') || ''
    }));

    // Update modal content based on current index
    function updateModalContent() {
        const data = testimonialData[currentTestimonialIndex];
        if (data) {
            testimonialModalImg.src = data.image;
            if (infoName) infoName.textContent = data.name;
            if (infoAge) infoAge.textContent = data.age;
            if (infoRequest) infoRequest.textContent = data.request;
        }
    }

    // Open modal when clicking on testimonial card
    testimonialCards.forEach((card, index) => {
        card.addEventListener('click', function() {
            currentTestimonialIndex = index;
            updateModalContent();
            testimonialModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });

    // Navigation functions
    function showPrevTestimonial() {
        currentTestimonialIndex = (currentTestimonialIndex - 1 + testimonialData.length) % testimonialData.length;
        updateModalContent();
    }

    function showNextTestimonial() {
        currentTestimonialIndex = (currentTestimonialIndex + 1) % testimonialData.length;
        updateModalContent();
    }

    function closeTestimonialModal() {
        testimonialModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Navigation button events
    if (testimonialPrevBtn) {
        testimonialPrevBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showPrevTestimonial();
        });
    }

    if (testimonialNextBtn) {
        testimonialNextBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showNextTestimonial();
        });
    }

    // Close modal on X button
    if (testimonialCloseBtn) {
        testimonialCloseBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeTestimonialModal();
        });
    }

    // Close modal on click anywhere (background, image, etc.)
    testimonialModal.addEventListener('click', function(e) {
        // Close if clicking on the modal background or the image
        if (e.target === testimonialModal || e.target === testimonialModalImg) {
            closeTestimonialModal();
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (!testimonialModal.classList.contains('active')) return;

        if (e.key === 'Escape') {
            closeTestimonialModal();
        } else if (e.key === 'ArrowLeft') {
            showPrevTestimonial();
        } else if (e.key === 'ArrowRight') {
            showNextTestimonial();
        }
    });
});

// Privacy checkbox validation with tooltip
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.querySelector('.contact-email-form');
    if (!contactForm) return;

    const privacyCheckbox = contactForm.querySelector('input[name="privacy"]');
    const tooltip = contactForm.querySelector('.privacy-tooltip');

    if (!privacyCheckbox || !tooltip) return;

    contactForm.addEventListener('submit', function(e) {
        if (!privacyCheckbox.checked) {
            e.preventDefault();
            tooltip.classList.add('show');

            // Скрыть подсказку через 3 секунды
            setTimeout(() => {
                tooltip.classList.remove('show');
            }, 3000);
        }
    });

    // Скрыть подсказку при клике на чекбокс
    privacyCheckbox.addEventListener('change', function() {
        if (this.checked) {
            tooltip.classList.remove('show');
        }
    });
});

// Contact Form - Modal instead of redirect
document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-form');
    const successModal = document.getElementById('success-modal');
    const modalClose = document.querySelector('.success-modal-close');

    if (contactForm && successModal) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Check privacy checkbox
            const privacyCheckbox = contactForm.querySelector('input[name="privacy"]');
            const privacyLabel = contactForm.querySelector('.privacy-checkbox');

            if (privacyCheckbox && !privacyCheckbox.checked) {
                // Animate checkbox to attract attention
                privacyLabel.classList.add('shake');
                setTimeout(() => {
                    privacyLabel.classList.remove('shake');
                }, 600);
                return;
            }

            const formData = new FormData(contactForm);
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;

            // Disable button during submission
            submitBtn.disabled = true;
            submitBtn.textContent = 'Отправка...';

            try {
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    // Show success modal
                    successModal.classList.add('active');
                    contactForm.reset();

                    // Auto-close after 5 seconds
                    setTimeout(() => {
                        successModal.classList.remove('active');
                    }, 5000);
                } else {
                    alert('Произошла ошибка. Попробуйте ещё раз.');
                }
            } catch (error) {
                alert('Произошла ошибка. Попробуйте ещё раз.');
            }

            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });

        // Close modal on X click
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                successModal.classList.remove('active');
            });
        }

        // Close modal on overlay click
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) {
                successModal.classList.remove('active');
            }
        });
    }
});