/* Dish photos: automatic compression, private moderation and resumable batches. */
(function () {
    'use strict';
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
    const pickers = new WeakMap();
    const reviews = new Map();
    let config = null, scanning = false;
    const ready = Auth.api('/content/review-photos/config').then(async response => response.ok ? response.json() : null).catch(() => null).then(value => { config = value?.enabled ? value : null; scan(); return config; });
    const dataUrl = blob => new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(blob); });
    async function json(url,options) {
        const response=await Auth.api(url,options);
        const data=await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие. Попробуйте ещё раз.');
        return data;
    }
    async function sendBinary(url,blob) {
        const send=()=>fetch(API_BASE+url,{method:'PUT',headers:{'Content-Type':'application/octet-stream','Authorization':'Bearer '+Auth.getToken()},body:blob,credentials:'include',signal:AbortSignal.timeout(120000)});
        let response=await send();
        if (response.status===401 && await Auth.refreshToken()) response=await send();
        const data=await response.json().catch(()=>({}));
        if (!response.ok) {
            const error=new Error(data.error || (response.status===413 ? 'Выберите фото размером до 20 МБ.' : 'Не удалось загрузить фото. Нажмите «Повторить загрузку».'));
            error.safeToChange=[400,401,403,404,409,413,415,422,429].includes(response.status);
            throw error;
        }
        return data;
    }
    async function prepare(file) {
        // Keep HEIC intact if this browser cannot decode it; the private server
        // worker will convert it. No third-party image upload/conversion service.
        let bitmap;
        try {
            bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
            const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
            const canvas=document.createElement('canvas');
            canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
            canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
            const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
            if (!blob) throw new Error('No browser encoder');
            return { blob, preview:await dataUrl(blob) };
        } catch { return { blob:file, preview:null }; }
        finally { bitmap?.close(); }
    }
    function picker(root) {
        let state=pickers.get(root);
        if (state) return state;
        state={ items:[],batchId:crypto.randomUUID(),busy:false,preparing:false,reviewId:Number(root.dataset.reviewId)||null };
        pickers.set(root,state);
        root.innerHTML='<div class="review-photo-picker"><button type="button" class="review-photo-button" data-photo-action="choose">Добавить фото блюда</button>'
            +'<input class="review-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple hidden>'
            +'<p class="review-photo-hint">До 3 фото. Размер уменьшим автоматически. После проверки фото будут видны другим пользователям.</p>'
            +'<div class="review-photo-selected"></div><p class="review-photo-status" role="status" aria-live="polite"></p>'
            +(root.dataset.standalone ? '<button type="button" class="review-photo-button review-photo-send" data-photo-action="send" hidden>Отправить фото</button>' : '')+'</div>';
        return state;
    }
    function redrawPicker(root) {
        const state=picker(root);
        const active=(reviews.get(state.reviewId)?.photos || []).filter(photo=>['pending','approved'].includes(photo.status)).length;
        root.querySelector('.review-photo-selected').innerHTML=state.items.map((item,index)=>'<div class="review-photo-selected-item">'
            +(item.preview ? '<img src="'+esc(item.preview)+'" alt="Выбранное фото '+(index+1)+'">' : '<div class="review-photo-placeholder">Фото '+(index+1)+'</div>')
            +'<span>'+esc(item.done ? 'Отправлено' : item.file.name)+'</span>'
            +'<button type="button" class="review-photo-button" data-photo-action="remove-selected" data-index="'+index+'"'+(state.busy || item.attempted ? ' disabled':'')+'>Убрать</button></div>').join('');
        root.querySelector('[data-photo-action="choose"]').disabled=state.busy || state.preparing || active+state.items.filter(item=>!item.done).length>=3;
        const send=root.querySelector('[data-photo-action="send"]');
        if (send) { send.hidden=!state.items.length; send.disabled=state.busy || state.preparing; send.textContent=state.failed ? 'Повторить загрузку' : 'Отправить фото'; }
    }
    async function uploadPicker(root,reviewId) {
        if (!root || !await ready) return 0;
        const state=picker(root);
        if (state.preparing) throw new Error('Подождите, фото ещё готовятся к отправке.');
        if (state.busy) throw new Error('Фото уже загружаются.');
        if (!state.items.length) return 0;
        state.reviewId=Number(reviewId); state.busy=true; state.failed=false;
        redrawPicker(root);
        const status=root.querySelector('.review-photo-status');
        try {
            for (let index=0;index<state.items.length;index++) {
                const item=state.items[index];
                if (item.done) continue;
                status.textContent='Загружаем фото '+(index+1)+' из '+state.items.length+'…';
                item.attempted=true;
                let result;
                try { result=await sendBinary('/content/reviews/'+state.reviewId+'/photos/'+item.requestId+'?batchId='+state.batchId,item.blob); }
                catch(error) { if(error.safeToChange)item.attempted=false;throw error; }
                item.done=true;
                let review=reviews.get(state.reviewId);
                if (!review) { review={photos:[],own:true}; reviews.set(state.reviewId,review); }
                if (!review.photos.some(photo=>photo.id===result.photo.id)) review.photos.push(result.photo);
            }
            const count=state.items.length;
            // The durable 15-minute fallback still notifies if this request fails.
            json('/content/reviews/'+state.reviewId+'/photo-batches/'+state.batchId+'/complete',{method:'POST'}).catch(()=>{});
            state.items=[]; state.batchId=crypto.randomUUID();
            status.textContent='Фото отправлены на проверку. Спасибо!';
            refreshReview(state.reviewId);
            return count;
        } catch(error) {
            state.failed=true;
            status.textContent=(error.message || 'Связь прервалась.')+' Выбранные фото сохранены на этой странице. Повторите отправку.';
            throw error;
        } finally { state.busy=false; redrawPicker(root); }
    }
    function configurePicker(root,reviewId) {
        if (!root || !config) return;
        picker(root).reviewId=Number(reviewId)||null; redrawPicker(root);
    }
    function markup(review) {
        reviews.set(Number(review.id),{...(reviews.get(Number(review.id)) || {photos:[]}),own:Auth.getUser()?.id===review.userId});
        return '<div class="review-photos" data-review-photo-id="'+Number(review.id)+'"></div>';
    }
    function photoCard(photo,own) {
        const label=photo.status==='pending' ? 'На проверке' : photo.status==='rejected' ? 'Не опубликовано' : '';
        return '<div class="review-photo-card" data-photo-id="'+esc(photo.id)+'">'
            +(photo.status==='rejected' ? '<div class="review-photo-placeholder">Фото не опубликовано</div>' : '<button type="button" class="review-photo-open" data-photo-action="view" data-photo-id="'+esc(photo.id)+'" aria-label="Увеличить фото блюда"><img alt="Фото приготовленного блюда" loading="lazy" data-photo-src="'+esc(photo.thumbnail)+'"></button>')
            +(label ? '<span class="review-photo-state">'+label+'</span>' : '')
            +(photo.reason ? '<p class="review-photo-hint">'+esc(photo.reason)+'</p>' : '')
            +(own ? '<button type="button" class="review-photo-button" data-photo-action="delete" data-photo-id="'+esc(photo.id)+'">Удалить фото</button>' : '')+'</div>';
    }
    function renderReview(root) {
        const id=Number(root.dataset.reviewPhotoId), state=reviews.get(id);
        if (!state) return;
        let gallery=root.querySelector('.review-photo-gallery');
        if (!gallery) {
            root.innerHTML='<div class="review-photo-gallery"></div><p class="review-photo-error" role="status"></p>'
                +(state.own ? '<div data-review-photo-picker data-standalone="true" data-review-id="'+id+'"></div>' : '');
            gallery=root.querySelector('.review-photo-gallery');
        }
        gallery.innerHTML=state.photos.filter(photo=>photo.status!=='deleted').map(photo=>photoCard(photo,state.own)).join('');
        const upload=root.querySelector('[data-review-photo-picker]');
        if (upload) redrawPicker(upload);
        loadImages(gallery);
    }
    function refreshReview(id) {
        document.querySelectorAll('[data-review-photo-id="'+Number(id)+'"]').forEach(renderReview);
    }
    async function fetchImage(img) {
        if (!img.isConnected || !img.dataset.photoSrc) return;
        const url=img.dataset.photoSrc; delete img.dataset.photoSrc;
        try {
            // Authenticated fetch protects pending photos. data: is already
            // allowed by the platform CSP; tokens never enter image URLs.
            const response=await Auth.api(url);
            if (!response.ok) throw new Error('Unavailable');
            img.src=await dataUrl(await response.blob());
        } catch { img.alt='Фото временно недоступно'; }
    }
    const imageObserver=typeof IntersectionObserver==='function' ? new IntersectionObserver(entries=>{
        for (const entry of entries) if(entry.isIntersecting){imageObserver.unobserve(entry.target);fetchImage(entry.target);}
    },{rootMargin:'250px'}) : null;
    function loadImages(root) {
        for (const img of root.querySelectorAll('img[data-photo-src]:not([data-photo-observed])')) {
            img.dataset.photoObserved='true';
            if(imageObserver)imageObserver.observe(img);else fetchImage(img);
        }
    }
    async function scan() {
        if (!config || scanning) return;
        scanning=true;
        try {
            document.querySelectorAll('[data-review-photo-picker]').forEach(root=>{ if (!pickers.has(root)) picker(root); });
            const roots=[...document.querySelectorAll('[data-review-photo-id]:not([data-photo-mounted])')];
            roots.forEach(root=>{root.dataset.photoMounted='true';});
            const ids=[...new Set(roots.map(root=>Number(root.dataset.reviewPhotoId)))];
            for (let offset=0;offset<ids.length;offset+=100) {
                const group=ids.slice(offset,offset+100);
                try {
                    const data=await json('/content/review-photos?reviewIds='+group.join(','));
                    for (const id of group) {
                        const state=reviews.get(id);
                        if (state) state.photos=data.photos.filter(photo=>photo.reviewId===id);
                    }
                    roots.filter(root=>group.includes(Number(root.dataset.reviewPhotoId))).forEach(renderReview);
                } catch {
                    roots.filter(root=>group.includes(Number(root.dataset.reviewPhotoId))).forEach(root=>{root.innerHTML='<button type="button" class="review-photo-button" data-photo-action="reload">Загрузить фотографии</button>';});
                }
            }
        } finally {
            scanning=false;
            if (document.querySelector('[data-review-photo-id]:not([data-photo-mounted])')) queueMicrotask(scan);
        }
    }
    document.addEventListener('change',async event=>{
        if (!event.target.matches('.review-photo-input')) return;
        const root=event.target.closest('[data-review-photo-picker]'), state=picker(root);
        const files=[...event.target.files]; event.target.value='';
        if (state.busy || state.preparing) return;
        state.preparing=true; redrawPicker(root);
        const status=root.querySelector('.review-photo-status');
        try {
            const active=(reviews.get(state.reviewId)?.photos || []).filter(photo=>['pending','approved'].includes(photo.status)).length;
            if (files.length+state.items.filter(item=>!item.done).length+active>3) throw new Error('Можно добавить до 3 фото к одному рецепту. Выберите меньше фотографий.');
            for (const file of files) {
                if (!file.size || file.size>config.maxInputBytes) throw new Error('Фото «'+file.name+'» слишком большое. Выберите снимок до 20 МБ.');
                if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('Выберите фотографию JPEG, PNG, WebP или HEIC.');
                status.textContent='Готовим фото…';
                state.items.push({file,requestId:crypto.randomUUID(),...await prepare(file)});
            }
            status.textContent='Фото готовы. Нажмите «Отправить».';
        } catch(error) { status.textContent=error.message; }
        finally { state.preparing=false; redrawPicker(root); }
    });
    document.addEventListener('click',async event=>{
        const button=event.target.closest('[data-photo-action]');
        if (!button || button.disabled) return;
        const action=button.dataset.photoAction;
        const pickerRoot=button.closest('[data-review-photo-picker]');
        if (action==='choose') { pickerRoot.querySelector('input').click(); return; }
        if (action==='remove-selected') {
            const state=picker(pickerRoot);
            if (!state.busy && !state.items[Number(button.dataset.index)]?.attempted) {
                state.items.splice(Number(button.dataset.index),1); state.failed=false;
                pickerRoot.querySelector('.review-photo-status').textContent=state.items.length ? 'Фото готовы. Нажмите «Отправить».' : '';
            }
            redrawPicker(pickerRoot); return;
        }
        if (action==='send') { try { await uploadPicker(pickerRoot,picker(pickerRoot).reviewId); } catch {} return; }
        const root=button.closest('[data-review-photo-id]');
        if (action==='reload') { delete root.dataset.photoMounted; scan(); return; }
        if (action==='view') { await view(button.dataset.photoId,button); return; }
        if (action==='delete') {
            const confirmed=typeof showAppConfirm==='function' ? await showAppConfirm({title:'Удалить фото?',text:'Фото исчезнет из отзыва.',confirmText:'Удалить',cancelText:'Отмена',danger:true}) : confirm('Удалить фото?');
            if (!confirmed) return;
            button.disabled=true;
            try {
                await json('/content/review-photos/'+button.dataset.photoId,{method:'DELETE'});
                const id=Number(root.dataset.reviewPhotoId), state=reviews.get(id);
                state.photos=state.photos.filter(photo=>photo.id!==button.dataset.photoId); refreshReview(id);
            } catch(error) { root.querySelector('.review-photo-error').textContent=error.message; button.disabled=false; }
        }
    });
    async function view(id,trigger) {
        const dialog=document.createElement('dialog'); dialog.className='review-photo-viewer';
        dialog.innerHTML='<button type="button" class="review-photo-button" autofocus>Закрыть</button><p role="status">Загружаем фото…</p><img alt="Фото приготовленного блюда" hidden>';
        document.body.append(dialog); dialog.showModal();
        const close=()=>dialog.close();
        dialog.querySelector('button').addEventListener('click',close);
        dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
        dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus({preventScroll:true});},{once:true});
        try {
            const response=await Auth.api('/content/review-photos/'+id+'/main');
            if (!response.ok) throw new Error('Фото недоступно. Возможно, оно уже удалено.');
            const src=await dataUrl(await response.blob());
            if (!dialog.isConnected) return;
            const img=dialog.querySelector('img'); img.src=src;img.hidden=false;dialog.querySelector('p').hidden=true;
        } catch(error) { if(dialog.isConnected)dialog.querySelector('p').textContent=error.message; }
    }
    new MutationObserver(records=>{
        for (const record of records) for (const node of record.removedNodes) if (node.nodeType===1) {
            if(node.matches('img[data-photo-observed]')) imageObserver?.unobserve(node);
            node.querySelectorAll('img[data-photo-observed]').forEach(img=>imageObserver?.unobserve(img));
        }
        if(!scanning)scan();
    }).observe(document.body,{childList:true,subtree:true});
    window.ReviewPhotos={markup,uploadPicker,configurePicker,ready,view,loadImages};
})();
