(function () {
    'use strict';
    if (!Auth.isLoggedIn() || Auth.getUser()?.role!=='admin') return;
    const esc=value=>String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    let next=null, loading=false, generation=0;
    const list=document.getElementById('admin-photo-list');
    const info=document.getElementById('admin-photo-info');
    async function api(url,options) {
        const response=await Auth.api(url,options), data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error || 'Не удалось загрузить фотографии.');
        return data;
    }
    function badge(count) {
        const node=document.getElementById('review-photos-badge');
        node.textContent=Number(count)||0; node.style.display=count ? 'inline':'none';
    }
    function card(photo) {
        return '<article class="admin-photo-card" data-admin-photo-id="'+esc(photo.id)+'"><h3>'+esc(photo.recipeName)+'</h3>'
            +'<p>'+esc(photo.author)+' · '+esc(new Date(photo.createdAt).toLocaleString('ru-RU'))+'</p>'
            +(photo.status!=='rejected' ? '<button type="button" class="review-photo-open" data-admin-photo-action="view" aria-label="Увеличить фото"><img data-photo-src="'+esc(photo.thumbnail)+'" alt="Фото блюда на проверке"></button>' : '<p>Фото отклонено и удалено из хранилища.</p>')
            +'<p><a href="recipe.html?id='+encodeURIComponent(photo.recipeId)+'#reviews-section" target="_blank" rel="noopener">Открыть рецепт и отзыв</a></p>'
            +(photo.reason ? '<p>'+esc(photo.reason)+'</p>':'')
            +(photo.status!=='rejected' ? '<label>Причина отклонения (необязательно)<textarea maxlength="300" rows="2" placeholder="Например: на фото нет готового блюда"></textarea></label>'
                +'<div class="admin-photo-actions">'+(photo.status==='pending' ? '<button type="button" class="review-photo-button" data-admin-photo-action="approved">Одобрить</button>':'')
                +'<button type="button" class="review-photo-button" data-admin-photo-action="rejected">'+(photo.status==='approved'?'Снять с публикации':'Отклонить')+'</button></div>':'')
            +'<p class="review-photo-error" role="status"></p></article>';
    }
    async function load(append=false) {
        if(loading)return;
        loading=true;
        const request=++generation;
        const more=document.getElementById('admin-photo-more');
        const status=document.getElementById('admin-photo-filter').value;
        info.textContent='Загружаем фотографии…';
        try {
            const config=await ReviewPhotos.ready;
            if(!config){info.textContent='Загрузка фото пока не включена.';return;}
            const data=await api('/admin/review-photos?status='+status+(append&&next?'&after='+encodeURIComponent(next):''));
            if(request!==generation)return;
            if(!append)list.innerHTML='';
            list.insertAdjacentHTML('beforeend',data.photos.map(card).join(''));
            next=data.next;more.hidden=!next;badge(data.pendingCount);
            info.textContent=list.children.length ? 'На проверке: '+data.pendingCount : 'В этом разделе пока нет фотографий.';
            ReviewPhotos.loadImages(list);
        }catch(error){info.textContent=error.message;}
        finally{loading=false;}
    }
    document.getElementById('admin-photo-filter').addEventListener('change',()=>load());
    document.getElementById('admin-photo-refresh').addEventListener('click',()=>load());
    document.getElementById('admin-photo-more').addEventListener('click',()=>load(true));
    list.addEventListener('click',async event=>{
        const button=event.target.closest('[data-admin-photo-action]');
        if(!button||button.disabled)return;
        const root=button.closest('[data-admin-photo-id]'),id=root.dataset.adminPhotoId,action=button.dataset.adminPhotoAction;
        if(action==='view'){ReviewPhotos.view(id,button);return;}
        if(action==='rejected' && !confirm('Отклонить и удалить это фото?'))return;
        root.querySelectorAll('button').forEach(node=>{node.disabled=true;});
        try {
            await api('/admin/review-photos/'+id,{method:'PUT',body:{status:action,reason:root.querySelector('textarea').value.trim()}});
            root.remove();
            const data=await api('/admin/review-photos?status=pending');badge(data.pendingCount);
            info.textContent=action==='approved'?'Фото одобрено и доступно пользователям.':'Фото отклонено и скрыто.';
        }catch(error){root.querySelector('.review-photo-error').textContent=error.message;root.querySelectorAll('button').forEach(node=>{node.disabled=false;});}
    });
    window.AdminReviewPhotos={load};
    ReviewPhotos.ready.then(config=>{if(config)api('/admin/review-photos?status=pending').then(data=>badge(data.pendingCount)).catch(()=>{});});
})();
