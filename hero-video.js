(function () {
    var isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (!isDesktop) return;

    function initHeroVideo() {
        var wrap = document.getElementById('heroVideoWrap');
        var toggle = document.getElementById('heroVideoToggle');
        if (!wrap) return;

        var video = document.createElement('video');
        video.className = 'hero-video';
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.poster = 'pictures/hero-video-poster.webp';
        video.setAttribute('aria-hidden', 'true');
        video.setAttribute('tabindex', '-1');

        var source = document.createElement('source');
        source.src = 'Video/hero-video.mp4';
        source.type = 'video/mp4';
        video.appendChild(source);

        wrap.appendChild(video);
        video.load();

        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(function () {});
        }

        if (toggle) {
            toggle.hidden = false;
            toggle.addEventListener('click', function () {
                video.muted = !video.muted;
                if (!video.muted) {
                    var playAttempt = video.play();
                    if (playAttempt && typeof playAttempt.catch === 'function') {
                        playAttempt.catch(function () {});
                    }
                }
                toggle.setAttribute('aria-pressed', String(!video.muted));
                toggle.setAttribute('aria-label', video.muted ? 'Activar sonido del video' : 'Silenciar video');
                toggle.querySelector('.hero-video-toggle-icon').textContent = video.muted ? '🔇' : '🔊';
            });
        }
    }

    function deferredInit() {
        setTimeout(initHeroVideo, 100);
    }

    if (document.readyState === 'complete') {
        deferredInit();
    } else {
        window.addEventListener('load', deferredInit);
    }
})();
