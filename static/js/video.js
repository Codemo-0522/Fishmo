// static/js/video.js
class VideoPlayer {
    constructor() {
        this.player = document.getElementById('videoPlayer');
        this.playerContainer = document.querySelector('.video-player-container');
        this.currentVideoPath = null;
        this.lazyObserver = null;
        this.defaultThumb = document.querySelector('.video-thumbnail').dataset.default;
        this.init();
    }

    init() {
        this.initObservers();
        this.initEvents();
        this.handleScroll();
        window.addEventListener('scroll', () => this.handleScroll());
    }

    initObservers() {
        this.lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.onerror = () => {
                            img.src = this.defaultThumb;
                            img.removeAttribute('data-src');
                        };
                        img.removeAttribute('data-src');
                        this.lazyObserver.unobserve(img);
                    }
                }
            });
        }, { rootMargin: "0px 0px 200px 0px" });

        document.querySelectorAll('.video-thumbnail[data-src]').forEach(img => {
            this.lazyObserver.observe(img);
        });
    }

    initEvents() {
        const searchButton = document.getElementById('searchButton');
        const searchInput = document.getElementById('searchInput');
        const searchResultsContainer = document.querySelector('.search-results-container');
        const searchResults = document.querySelector('.search-results');
        const originalVideoGrid = document.querySelector('.video-grid-container');
        const categories = document.querySelector('.video-categories');

        // 视频点击播放（事件委托）
        document.querySelector('#APP').addEventListener('click', async (e) => {
            const card = e.target.closest('.video-card');
            if (!card) return;

            try {
                const videoPath = '/videos/' + card.dataset.path;

                if (this.currentVideoPath !== videoPath) {
                    this.currentVideoPath = videoPath;
                    this.player.src = videoPath;
                    this.playerContainer.classList.remove('hidden');

                    await new Promise((resolve, reject) => {
                        this.player.onloadedmetadata = resolve;
                        this.player.onerror = () => reject(new Error('视频加载失败'));
                    });
                }

                await this.player.play();

                if (!this.player.querySelector('.video-player').classList.contains('minimized')) {
                    window.scrollTo({
                        top: 0,
                        behavior: 'smooth'
                    });
                }

                this.player.controls = true;

            } catch (error) {
                console.error('播放失败:', error);
                this.player.controls = true;
            }
        });

        // 分类过滤
        categories.addEventListener('click', (e) => {
            const category = e.target.closest('.category');
            if (!category) return;

            document.querySelectorAll('.category').forEach(c => c.classList.remove('active'));
            category.classList.add('active');

            searchInput.value = '';
            originalVideoGrid.classList.remove('hidden');
            searchResultsContainer.classList.add('hidden');

            const selected = category.dataset.category;
            document.querySelectorAll('.folder-grid').forEach(div => {
                div.style.display = (selected === 'all' || div.dataset.category === selected)
                                  ? 'block'
                                  : 'none';
            });
        });

        // 增强的搜索功能
        const performSearch = () => {
            const keyword = searchInput.value.trim().toLowerCase();
            if (keyword) {
                originalVideoGrid.classList.add('hidden');
                searchResultsContainer.classList.remove('hidden');
                searchResults.innerHTML = '';

                document.querySelectorAll('.video-card').forEach(card => {
                    const name = card.querySelector('.video-title').textContent.toLowerCase();
                    if (name.includes(keyword)) {
                        const clone = card.cloneNode(true);
                        const thumbnail = clone.querySelector('.video-thumbnail');

                        // 重置缩略图状态
                        if (thumbnail.dataset.src) {
                            thumbnail.src = this.defaultThumb;
                            thumbnail.setAttribute('data-src', thumbnail.dataset.src);
                            this.lazyObserver.observe(thumbnail);
                        }

                        searchResults.appendChild(clone);
                    }
                });
            } else {
                originalVideoGrid.classList.remove('hidden');
                searchResultsContainer.classList.add('hidden');
            }
        };

        searchButton.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });

        this.player.addEventListener('ended', () => {
            this.player.controls = false;
        });
    }

    handleScroll() {
        const containerTop = this.playerContainer.getBoundingClientRect().top;
        if (containerTop < -100) {
            this.playerContainer.querySelector('.video-player').classList.add('minimized');
        } else {
            this.playerContainer.querySelector('.video-player').classList.remove('minimized');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VideoPlayer();
});