(function (global) {
    'use strict';

    const ORIGIN = 'https://plate.voronova.online';
    const SHARE_IMAGE = 'https://plate.voronova.online/images/smartplate-share-v2.jpg';
    const RECIPE_CATEGORY_NAMES = {
        breakfasts: 'Завтраки',
        soups: 'Супы',
        mains: 'Горячее',
        cutlets: 'Котлеты',
        salads: 'Салаты',
        sides: 'Гарниры',
        pancakes: 'Блины и оладьи',
        spreads: 'Намазки',
        sauces: 'Соусы',
        bases: 'Основа',
        breads: 'Хлеб и крекеры',
        drinks: 'Напитки'
    };
    let activeRecipeSchema = null;

    function upsertMeta(attribute, key, content) {
        if (!content) return;
        let node = document.head.querySelector('meta[' + attribute + '="' + key + '"]');
        if (!node) {
            node = document.createElement('meta');
            node.setAttribute(attribute, key);
            document.head.appendChild(node);
        }
        node.setAttribute('content', String(content));
    }

    function setCanonical(url) {
        let node = document.head.querySelector('link[rel="canonical"]');
        if (!node) {
            node = document.createElement('link');
            node.setAttribute('rel', 'canonical');
            document.head.appendChild(node);
        }
        node.setAttribute('href', url);
    }

    function setJsonLd(id, value) {
        let node = document.getElementById(id);
        if (!node) {
            node = document.createElement('script');
            node.id = id;
            node.type = 'application/ld+json';
            document.head.appendChild(node);
        }
        node.textContent = JSON.stringify(value);
    }

    function absoluteUrl(path) {
        const value = Array.isArray(path) ? path[0] : path;
        if (!value || value === true) return SHARE_IMAGE;
        try { return new URL(String(value), ORIGIN + '/').href; }
        catch (_) { return SHARE_IMAGE; }
    }

    function clean(value) {
        return String(value || '').replace(/^[«"']|[»"']$/g, '').replace(/\s+/g, ' ').trim();
    }

    function summary(value, maxLength) {
        const text = clean(value);
        const limit = maxLength || 180;
        if (text.length <= limit) return text;
        const shortened = text.slice(0, limit + 1).replace(/\s+\S*$/, '').replace(/[\s,;:—-]+$/, '');
        return shortened + '…';
    }

    function setPage(options) {
        const opts = options || {};
        const title = clean(opts.title) || 'Умная тарелка';
        const description = clean(opts.description) || 'Полезные рецепты и персональный помощник в сбалансированном питании от нутрициолога Юлии Вороновой.';
        const canonical = opts.canonical || ORIGIN + '/';
        const image = absoluteUrl(opts.image);

        document.title = title;
        upsertMeta('name', 'description', description);
        upsertMeta('name', 'robots', opts.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large');
        setCanonical(canonical);
        upsertMeta('property', 'og:title', title);
        upsertMeta('property', 'og:description', description);
        upsertMeta('property', 'og:image', image);
        upsertMeta('property', 'og:image:secure_url', image);
        upsertMeta('property', 'og:image:type', /\.jpe?g(?:$|\?)/i.test(image) ? 'image/jpeg' : (/\.png(?:$|\?)/i.test(image) ? 'image/png' : 'image/webp'));
        upsertMeta('property', 'og:url', canonical);
        upsertMeta('property', 'og:type', opts.type || 'website');
        upsertMeta('property', 'og:locale', 'ru_RU');
        upsertMeta('property', 'og:site_name', 'Умная тарелка');
        upsertMeta('name', 'twitter:card', 'summary_large_image');
        upsertMeta('name', 'twitter:title', title);
        upsertMeta('name', 'twitter:description', description);
        upsertMeta('name', 'twitter:image', image);
        if (opts.schema) setJsonLd('smartplate-page-schema', opts.schema);
    }

    function ingredientText(item) {
        return clean(typeof item === 'string' ? item : item && item.name)
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    }

    function stepText(step) {
        return clean(typeof step === 'string' ? step : step && step.text);
    }

    function stepImage(step) {
        if (!step || typeof step !== 'object') return '';
        const photo = Array.isArray(step.photo)
            ? step.photo.find(function (item) { return typeof item === 'string' && item; })
            : step.photo;
        return typeof photo === 'string' && photo ? absoluteUrl(photo) : '';
    }

    function stepName(text, index) {
        const firstSentence = clean(text).match(/^.*?[.!?](?:\s|$)/);
        return summary(firstSentence ? firstSentence[0] : text, 90) || ('Шаг ' + (index + 1));
    }

    function recipeCategories(recipe) {
        const ids = Array.isArray(recipe.categories) && recipe.categories.length
            ? recipe.categories
            : (recipe.cat ? [recipe.cat] : []);
        return ids.map(function (id) { return RECIPE_CATEGORY_NAMES[id]; }).filter(Boolean).join(', ');
    }

    function setRecipe(recipe) {
        if (!recipe || !recipe.id) return;
        const canonical = ORIGIN + '/recipe.html?id=' + encodeURIComponent(recipe.id);
        const description = summary(recipe.quote) || (recipe.name + ' — рецепт с расчётом КБЖУ и пошаговым приготовлением в сервисе «Умная тарелка».');
        const image = absoluteUrl(recipe.photo);
        const isFree = recipe.accessLevel === 'free' || recipe.free === true;
        const schema = {
            '@context': 'https://schema.org',
            '@type': isFree ? 'Recipe' : 'WebPage',
            name: recipe.name,
            description: description,
            url: canonical,
            image: [image],
            author: { '@type': 'Person', name: 'Юлия Воронова', url: 'https://voronova.online/' },
            isAccessibleForFree: isFree
        };

        if (isFree) {
            const ingredients = (recipe.ingredients || []).map(ingredientText).filter(Boolean);
            const instructions = (recipe.steps || []).map(function (step, index) {
                const text = stepText(step);
                if (!text) return null;
                const instruction = {
                    '@type': 'HowToStep',
                    name: stepName(text, index),
                    text: text,
                    url: canonical + '#recipe-step-' + (index + 1)
                };
                const image = stepImage(step);
                if (image) instruction.image = image;
                return instruction;
            }).filter(Boolean);
            const category = recipeCategories(recipe);
            const keywords = (recipe.tags || []).map(clean).filter(Boolean);
            if (recipe.yieldLabel) schema.recipeYield = recipe.yieldLabel;
            else if (recipe.servings) schema.recipeYield = String(recipe.servings) + ' порций';
            if (Number(recipe.time) > 0) schema.totalTime = 'PT' + Number(recipe.time) + 'M';
            if (ingredients.length) schema.recipeIngredient = ingredients;
            if (instructions.length) schema.recipeInstructions = instructions;
            if (category) schema.recipeCategory = category;
            if (keywords.length) schema.keywords = keywords.join(', ');
            schema.nutrition = {
                '@type': 'NutritionInformation',
                calories: Number(recipe.kcal || 0) + ' ккал',
                proteinContent: Number(recipe.protein || 0) + ' г',
                fatContent: Number(recipe.fat || 0) + ' г',
                carbohydrateContent: Number(recipe.carbs || 0) + ' г',
                fiberContent: Number(recipe.fiber || 0) + ' г'
            };
        }

        activeRecipeSchema = isFree ? { id: recipe.id, schema: schema } : null;

        setPage({
            title: recipe.name + ' — рецепт | Умная тарелка',
            description: description,
            canonical: canonical,
            image: image,
            type: isFree ? 'article' : 'website',
            schema: schema
        });
    }

    function setRecipeRating(recipeId, rating) {
        if (!activeRecipeSchema || activeRecipeSchema.id !== recipeId) return;
        const value = Number(rating && rating.value);
        const count = Number(rating && rating.count);
        if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(count) || count < 1) {
            delete activeRecipeSchema.schema.aggregateRating;
        } else {
            activeRecipeSchema.schema.aggregateRating = {
                '@type': 'AggregateRating',
                ratingValue: Number(value.toFixed(1)),
                ratingCount: Math.floor(count),
                bestRating: 5,
                worstRating: 1
            };
        }
        setJsonLd('smartplate-page-schema', activeRecipeSchema.schema);
    }

    function setCollection(options) {
        const opts = options || {};
        const canonical = opts.canonical || ORIGIN + '/category.html';
        const items = (opts.items || []).slice(0, 100).map(function (item, index) {
            return {
                '@type': 'ListItem',
                position: index + 1,
                name: item.name,
                url: ORIGIN + '/recipe.html?id=' + encodeURIComponent(item.id)
            };
        });
        const schema = {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: opts.name,
            description: opts.description,
            url: canonical,
            isPartOf: { '@type': 'WebSite', name: 'Умная тарелка', url: ORIGIN + '/' }
        };
        if (items.length) schema.mainEntity = { '@type': 'ItemList', itemListElement: items };
        setPage({
            title: opts.name + ' | Умная тарелка',
            description: opts.description,
            canonical: canonical,
            noindex: opts.noindex,
            schema: schema
        });
    }

    global.SmartPlateSEO = {
        origin: ORIGIN,
        setPage: setPage,
        setRecipe: setRecipe,
        setRecipeRating: setRecipeRating,
        setCollection: setCollection
    };
})(window);
