(function () {
    'use strict';
    if (!window.SmartPlateSEO) return;
    SmartPlateSEO.setPage({
        title: 'Умная тарелка — рецепты и сбалансированное питание',
        description: 'Умная тарелка Юлии Вороновой: полезные рецепты с расчётом КБЖУ, заменами продуктов, пошаговыми инструкциями и помощником для сбалансированного питания.',
        canonical: 'https://plate.voronova.online/',
        image: 'https://plate.voronova.online/images/smartplate-share.jpg',
        schema: {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Умная тарелка',
            url: 'https://plate.voronova.online/',
            description: 'Полезные рецепты и персональный помощник в сбалансированном питании от нутрициолога Юлии Вороновой.',
            publisher: {
                '@type': 'Person',
                name: 'Юлия Воронова',
                url: 'https://voronova.online/'
            },
            potentialAction: {
                '@type': 'SearchAction',
                target: 'https://plate.voronova.online/category.html?q={search_term_string}',
                'query-input': 'required name=search_term_string'
            }
        }
    });
})();
