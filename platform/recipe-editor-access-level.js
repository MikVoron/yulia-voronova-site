                (function () {
                    var sel = document.getElementById('re-access-level');
                    var cb = document.getElementById('re-free');
                    if (!sel || !cb) return;
                    function sync() { cb.checked = (sel.value === 'free'); }
                    sel.addEventListener('change', sync);
                    sync();
                })();
