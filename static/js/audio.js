// 全局应用状态管理
const AudioApp = {
    // 应用状态
    state: {
        currentView: 'home',
        previousView: null,
        currentPage: 1,
        currentPlaylist: [],
        currentTrackIndex: -1,
        isPlaying: false,
        playMode: 'sequence', // sequence, shuffle, repeat-one
        volume: 1,
        isMuted: false,
        searchQuery: '',
        globalPlaylist: [], // 全局歌曲列表，用于随机播放
        globalTrackIndex: -1, // 全局歌曲索引
        allFilteredTracks: [], // 当前过滤后的全部歌曲数据，用于翻页
        // 🎯 新增：播放上下文管理
        playlistContext: {
            type: null, // 'all-tracks' | 'album' | 'recent' | 'search'
            source: null, // 源数据（如专辑ID、搜索关键词等）
            fullPlaylist: [], // 完整的播放列表（用于上一首/下一首）
            currentPage: 1, // 当前页码
            totalPages: 1 // 总页数
        }
    },
    
    // 音频播放器
    audioPlayer: new Audio(),
    
    // 初始化应用
    init() {
        this.bindEvents();
        this.initTheme();
        this.initPlayer();
        this.loadView('home');

        this.initSidebar();
        
        // 预加载全局播放列表，提升随机播放性能
        this.loadGlobalPlaylist().catch(error => {
            console.log('预加载全局播放列表失败:', error);
        });
    },
    
    // 绑定事件
    bindEvents() {
        // 导航切换
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => this.handleNavClick(item));
        });
        
        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }
        
        // 播放控制
        this.bindPlayerControls();
        
        // 其他控制
        this.bindOtherControls();
        
        // 音频播放器事件
        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.audioPlayer.addEventListener('ended', () => this.handleTrackEnd());
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
        
        // 额外的事件监听器以确保移动端正确显示时长
        this.audioPlayer.addEventListener('loadeddata', () => this.updateDuration());
        this.audioPlayer.addEventListener('canplay', () => this.updateDuration());
        this.audioPlayer.addEventListener('durationchange', () => this.updateDuration());
        
        // 键盘快捷键支持
        this.bindKeyboardShortcuts();
    },
    
    // 绑定播放器控制
    bindPlayerControls() {
        const controls = {
            playPauseBtn: () => this.togglePlayPause(),
            prevBtn: () => this.playPrevious(),
            nextBtn: () => this.playNext(),
            playModeBtn: () => this.togglePlayMode(),
            volumeBtn: () => this.toggleMute()
        };
        
        Object.keys(controls).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', controls[id]);
            }
        });
        
        // 进度条控制（点击和拖拽）
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.addEventListener('click', (e) => this.seekTo(e));
            this.bindProgressDrag(progressBar);
        }
        
        // 音量控制（点击、拖拽、滚轮）
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeContainer = document.getElementById('volumeContainer');
        if (volumeSlider) {
            volumeSlider.addEventListener('click', (e) => this.setVolume(e));
            this.bindVolumeDrag(volumeSlider);
        }
        if (volumeContainer) {
            volumeContainer.addEventListener('wheel', (e) => this.handleVolumeWheel(e));
        }
    },
    
    // 绑定键盘快捷键
    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 如果在输入框中，不处理快捷键
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            switch(e.code) {
                case 'Space': // 空格键：播放/暂停
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 'ArrowLeft': // 左箭头：上一首
                    e.preventDefault();
                    this.playPrevious();
                    break;
                case 'ArrowRight': // 右箭头：下一首
                    e.preventDefault();
                    this.playNext();
                    break;
                case 'ArrowUp': // 上箭头：音量+
                    e.preventDefault();
                    this.state.volume = Math.min(1, this.state.volume + 0.1);
                    this.audioPlayer.volume = this.state.volume;
                    this.updateVolumeDisplay();
                    break;
                case 'ArrowDown': // 下箭头：音量-
                    e.preventDefault();
                    this.state.volume = Math.max(0, this.state.volume - 0.1);
                    this.audioPlayer.volume = this.state.volume;
                    this.updateVolumeDisplay();
                    break;
                case 'KeyM': // M键：静音切换
                    e.preventDefault();
                    this.toggleMute();
                    break;
                case 'KeyS': // S键：切换播放模式
                    e.preventDefault();
                    this.togglePlayMode();
                    break;
            }
        });
    },
    
    // 绑定其他控制
    bindOtherControls() {
        // 侧边栏切换（新按钮在navbar中，事件在HTML中绑定）
        // 无需在这里绑定，因为按钮是动态创建并绑定的
        
        // 绑定遮罩层点击事件（移动端点击外部折叠侧边栏）
        const overlay = document.getElementById('audioSidebarOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => {
                this.collapseSidebar();
            });
        }
        
        // 主题切换
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        // 返回按钮
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.goBack());
        }
        
        // 播放全部按钮
        const playAllTracksBtn = document.getElementById('playAllTracksBtn');
        if (playAllTracksBtn) {
            playAllTracksBtn.addEventListener('click', () => this.playAllTracks());
        }
        
        // 专辑播放按钮
        const playAlbumBtn = document.getElementById('playAlbumBtn');
        if (playAlbumBtn) {
            playAlbumBtn.addEventListener('click', () => this.playCurrentAlbum());
        }
        
        // 清除搜索
        const clearSearch = document.getElementById('clearSearch');
        if (clearSearch) {
            clearSearch.addEventListener('click', () => this.clearSearch());
        }
    },
    
    // 初始化主题（使用全局主题）
    initTheme() {
        // 使用全局主题，不再独立设置
        const globalTheme = localStorage.getItem('globalTheme') || 'dark';
        // 确保与全局主题同步
        if (document.documentElement.getAttribute('data-theme') !== globalTheme) {
            document.documentElement.setAttribute('data-theme', globalTheme);
            document.body.setAttribute('data-theme', globalTheme);
        }
    },
    
    // 初始化播放器
    initPlayer() {
        this.audioPlayer.volume = this.state.volume;
        this.updateVolumeDisplay();
        this.updatePlayModeButton();
    },
    
    // 初始化侧边栏
    initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('audioSidebarOverlay');
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        
        if (sidebar) {
            if (isCollapsed) {
            sidebar.classList.add('collapsed');
                if (overlay) {
                    overlay.classList.remove('active');
                }
        } else {
                // 在移动端，默认折叠侧边栏
                if (window.innerWidth <= 768) {
                sidebar.classList.add('collapsed');
                    if (overlay) {
                        overlay.classList.remove('active');
                    }
                }
            }
        }
    },
    
    // 处理导航点击
    handleNavClick(item) {
        const view = item.dataset.view;
        if (!view) return;
        
        // 更新活跃状态
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // 加载对应视图
        this.loadView(view);
        
        // 🎯 更新播放按钮状态（确保视图切换后按钮状态正确）
        setTimeout(() => {
            this.updatePlayButton();
        }, 100);
    },
    
    // 加载视图
    async loadView(view) {
        this.state.currentView = view;
        this.hideAllViews();
        
        switch(view) {
            case 'home':
                await this.showHomeView();
                break;
            case 'albums':
                await this.showAlbumsView();
                break;
            case 'tracks':
                await this.showTracksView();
                break;
        }
    },
    
    // 隐藏所有视图
    hideAllViews() {
        const views = ['homeView', 'albumsView', 'tracksView', 'albumDetailView'];
        views.forEach(viewId => {
            const view = document.getElementById(viewId);
            if (view) view.style.display = 'none';
        });
    },
    
    // 显示首页
    async showHomeView() {
        const pageTitle = document.getElementById('pageTitle');
        const homeView = document.getElementById('homeView');
        const searchInput = document.getElementById('searchInput');
        
        if (pageTitle) pageTitle.textContent = '发现音乐';
        if (homeView) homeView.style.display = 'block';
        if (searchInput) searchInput.placeholder = '搜索音乐...';
        
        try {
            await this.loadRecommendedAlbums();
            await this.loadRecentTracks();
        } catch (error) {
            this.showError('加载首页内容失败');
        }
    },
    
    // 显示专辑视图
    async showAlbumsView() {
        const pageTitle = document.getElementById('pageTitle');
        const albumsView = document.getElementById('albumsView');
        const searchInput = document.getElementById('searchInput');
        
        if (pageTitle) pageTitle.textContent = '专辑';
        if (albumsView) albumsView.style.display = 'block';
        if (searchInput) searchInput.placeholder = '搜索专辑...';
        
        try {
            await this.loadAlbums();
        } catch (error) {
            this.showError('加载专辑失败');
        }
    },
    
    // 显示歌曲视图
    async showTracksView() {
        const pageTitle = document.getElementById('pageTitle');
        const tracksView = document.getElementById('tracksView');
        const searchInput = document.getElementById('searchInput');
        
        if (pageTitle) pageTitle.textContent = '全部歌曲';
        if (tracksView) tracksView.style.display = 'block';
        if (searchInput) searchInput.placeholder = '搜索歌曲或艺术家...';
        
        try {
            await this.loadAllTracks();
        } catch (error) {
            this.showError('加载歌曲失败');
        }
    },
    
    // 加载推荐专辑
    async loadRecommendedAlbums() {
        try {
            const response = await fetch('/api/audio_collections?page=1&per_page=8');
            const data = await response.json();
            
            if (data.status === 'success') {
                const container = document.getElementById('recommendedAlbums');
                this.renderAlbumGrid(data.data.collections, container);
            }
        } catch (error) {
            console.error('加载推荐专辑失败:', error);
        }
    },
    
    // 加载最新歌曲
    async loadRecentTracks() {
        try {
            // 从专辑中获取最新歌曲
            const response = await fetch('/api/audio_collections?page=1&per_page=5');
            const data = await response.json();
            
            if (data.status === 'success') {
                const allTracks = [];
                
                for (const collection of data.data.collections) {
                    try {
                        const albumResponse = await fetch(`/api/audio_collection/${collection.collection_id}`);
                        const albumData = await albumResponse.json();
                        
                        if (albumData.status === 'success' && albumData.data.tracks) {
                            albumData.data.tracks.slice(0, 2).forEach(track => {
                                allTracks.push({
                                    ...track,
                                    album: albumData.data.collection_name,
                                    albumCover: albumData.data.cover_path
                                });
                            });
                        }
                    } catch (err) {
                        console.error(`获取专辑 ${collection.collection_id} 失败:`, err);
                    }
                }
                
                const container = document.getElementById('recentTracks');
                this.renderTrackList(allTracks.slice(0, 10), container, true);
            }
        } catch (error) {
            console.error('加载最新歌曲失败:', error);
        }
    },
    
    // 加载所有专辑
    async loadAlbums(page = 1) {
        try {
            let url = `/api/audio_collections?page=${page}&per_page=20`;
            if (this.state.searchQuery) {
                url += `&search=${encodeURIComponent(this.state.searchQuery)}`;
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'success') {
                const container = document.getElementById('albumGrid');
                this.renderAlbumGrid(data.data.collections, container);
                this.renderPagination(data.data.pagination, 'albumPagination');
            }
        } catch (error) {
            console.error('加载专辑失败:', error);
        }
    },
    
    // 加载所有歌曲
    async loadAllTracks(page = 1) {
        try {
            const response = await fetch('/api/audio_collections?page=1&per_page=100');
            const data = await response.json();
            
            if (data.status === 'success') {
                const allTracks = [];
                
                // 获取每个专辑的详细信息
                for (const collection of data.data.collections) {
                    try {
                        const albumResponse = await fetch(`/api/audio_collection/${collection.collection_id}`);
                        const albumData = await albumResponse.json();
                        
                        if (albumData.status === 'success' && albumData.data.tracks) {
                            albumData.data.tracks.forEach(track => {
                                allTracks.push({
                                    ...track,
                                    album: albumData.data.collection_name,
                                    albumCover: albumData.data.cover_path
                                });
                            });
                        }
                    } catch (err) {
                        console.error(`获取专辑 ${collection.collection_id} 失败:`, err);
                    }
                }
                
                // 过滤搜索结果
                let filteredTracks = allTracks;
                if (this.state.searchQuery) {
                    const query = this.state.searchQuery.toLowerCase();
                    filteredTracks = allTracks.filter(track => 
                        (track.title || '').toLowerCase().includes(query) ||
                        (track.artist || '').toLowerCase().includes(query) ||
                        (track.album || '').toLowerCase().includes(query)
                    );
                }
                
                // 分页
                const perPage = 50;
                const startIndex = (page - 1) * perPage;
                const endIndex = startIndex + perPage;
                const paginatedTracks = filteredTracks.slice(startIndex, endIndex);
                
                // 创建分页信息
                const totalPages = Math.ceil(filteredTracks.length / perPage);
                
                // 🎯 关键修复：设置当前播放列表为当前页的歌曲
                this.state.currentPlaylist = paginatedTracks;
                // 🎯 保存全部歌曲数据用于翻页
                this.state.allFilteredTracks = filteredTracks;
                // 🎯 设置播放上下文为全部歌曲
                this.state.playlistContext = {
                    type: 'all-tracks',
                    source: this.state.searchQuery || null,
                    fullPlaylist: filteredTracks,
                    currentPage: page,
                    totalPages: totalPages
                };
                
                const container = document.getElementById('trackList');
                this.renderTrackList(paginatedTracks, container);
                
                const paginationData = {
                    current_page: page,
                    total_pages: totalPages,
                    total_items: filteredTracks.length,
                    per_page: perPage
                };
                this.renderPagination(paginationData, 'tracksPagination');
            }
        } catch (error) {
            console.error('加载歌曲失败:', error);
        }
    },
    
    // 渲染专辑网格
    renderAlbumGrid(albums, container) {
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!albums || albums.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>暂无专辑</h3><p>没有找到任何专辑</p></div>';
        return;
    }
    
        albums.forEach(album => {
            const albumCard = document.createElement('div');
            albumCard.className = 'album-card';
            albumCard.innerHTML = `
                <img class="album-cover" src="${album.cover_path || '/static/images/default.jpg'}" alt="${album.collection_name}">
                <div class="album-title">${album.collection_name}</div>
                <div class="album-artist">${album.artist || '未知艺术家'}</div>
                <div class="album-stats">${album.audio_count || 0} 首歌曲</div>
            `;
            
            albumCard.addEventListener('click', () => this.showAlbumDetail(album.collection_id));
            container.appendChild(albumCard);
        });
    },
    
    // 渲染歌曲列表
    renderTrackList(tracks, container, compact = false) {
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!tracks || tracks.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>暂无歌曲</h3><p>没有找到任何歌曲</p></div>';
        return;
    }
    
        if (compact) {
            container.classList.add('compact');
        }
        
        tracks.forEach((track, index) => {
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
        trackItem.innerHTML = `
            <div class="track-number">${index + 1}</div>
            <div class="track-info">
                <div class="track-title">${track.title || '未知标题'}</div>
                <div class="track-artist">${track.artist || '未知艺术家'}</div>
            </div>
                <div class="track-duration">${this.formatDuration(track.duration)}</div>
                <div class="track-actions">
                    <button class="track-action-btn" title="喜欢">
                        <i class="far fa-heart"></i>
                    </button>
                </div>
            `;
            
            // 🎯 添加点击事件，需要根据当前视图设置正确的上下文
            trackItem.addEventListener('click', () => {
                const context = this.getCurrentPlaylistContext(tracks);
                this.playTrackFromList(tracks, index, context);
            });
            container.appendChild(trackItem);
        });
    },
    
    // 显示专辑详情
    async showAlbumDetail(albumId) {
        try {
            const response = await fetch(`/api/audio_collection/${albumId}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                const album = data.data;
                
                // 保存之前的视图状态
                this.state.previousView = this.state.currentView;
                
                // 隐藏其他视图
                this.hideAllViews();
                const albumDetailView = document.getElementById('albumDetailView');
                if (albumDetailView) albumDetailView.style.display = 'block';
                
                // 🎯 设置正确的视图状态
                this.state.currentView = 'albumDetail';
                
                // 更新专辑信息
                const elements = {
                    albumCover: document.getElementById('albumCover'),
                    albumTitle: document.getElementById('albumTitle'),
                    albumArtist: document.getElementById('albumArtist'),
                    albumTrackCount: document.getElementById('albumTrackCount')
                };
                
                if (elements.albumCover) elements.albumCover.src = album.cover_path || '/static/images/default.jpg';
                if (elements.albumTitle) elements.albumTitle.textContent = album.collection_name;
                if (elements.albumArtist) elements.albumArtist.textContent = album.artist || '未知艺术家';
                if (elements.albumTrackCount) elements.albumTrackCount.textContent = `${album.audio_count || 0} 首歌曲`;
                
                // 渲染专辑歌曲
                const albumTracks = document.getElementById('albumTracks');
                this.renderTrackList(album.tracks, albumTracks);
                
                // 保存专辑信息用于播放
                this.currentAlbum = album;
                
                // 🎯 设置播放上下文为专辑
                this.state.playlistContext = {
                    type: 'album',
                    source: albumId,
                    fullPlaylist: album.tracks || [],
                    currentPage: 1,
                    totalPages: 1
                };
                
                // 🎯 更新播放按钮状态
                this.updatePlayButton();
            }
        } catch (error) {
            this.showError('加载专辑详情失败');
        }
    },
    
    // 返回上一级
    goBack() {
        // 根据之前的视图状态返回到正确的页面
        const previousView = this.state.previousView || 'albums';
        this.loadView(previousView);
    },
    
    // 处理搜索
    handleSearch(query) {
        this.state.searchQuery = query.trim();
        
        // 显示/隐藏清除按钮
        const clearSearch = document.getElementById('clearSearch');
        if (clearSearch) {
            clearSearch.style.display = this.state.searchQuery ? 'block' : 'none';
        }
        
        // 防抖搜索
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch();
        }, 300);
    },
    
    // 执行搜索
    performSearch() {
        switch(this.state.currentView) {
            case 'home':
                this.searchInHome();
                break;
            case 'albums':
                this.loadAlbums(1);
                break;
            case 'tracks':
                this.loadAllTracks(1);
                break;
        }
    },
    
    // 首页搜索功能
    async searchInHome() {
        if (!this.state.searchQuery) {
            // 如果搜索为空，重新加载默认内容
            await this.loadRecommendedAlbums();
            await this.loadRecentTracks();
            
            // 🎯 恢复原始标题
            const albumSection = document.getElementById('recommendedAlbums')?.closest('.home-section')?.querySelector('h2');
            const trackSection = document.getElementById('recentTracks')?.closest('.home-section')?.querySelector('h2');
            if (albumSection) albumSection.textContent = '推荐专辑';
            if (trackSection) trackSection.textContent = '最新添加';
            
            return;
        }
        
        try {
            // 搜索专辑
            const albumsResponse = await fetch(`/api/audio_collections?search=${encodeURIComponent(this.state.searchQuery)}`);
            const albumsData = await albumsResponse.json();
            
            // 搜索单曲（从所有专辑中筛选）
            const allTracksData = await this.getAllTracksData();
            const query = this.state.searchQuery.toLowerCase();
            const filteredTracks = allTracksData.filter(track => 
                (track.title || '').toLowerCase().includes(query) ||
                (track.artist || '').toLowerCase().includes(query) ||
                (track.album || '').toLowerCase().includes(query)
            );
            
            // 更新首页显示
            const recommendedAlbums = document.getElementById('recommendedAlbums');
            const recentTracks = document.getElementById('recentTracks');
            
            // 🎯 更新搜索结果的节标题
            const albumSection = recommendedAlbums?.closest('.home-section')?.querySelector('h2');
            const trackSection = recentTracks?.closest('.home-section')?.querySelector('h2');
            
            if (albumsData.status === 'success' && recommendedAlbums) {
                this.renderAlbumGrid(albumsData.data.collections, recommendedAlbums);
                if (albumSection) {
                    albumSection.textContent = `搜索到 ${albumsData.data.collections.length} 个专辑`;
                }
            }
            
            if (recentTracks) {
                // 🎯 如果搜索结果很多，给用户一个加载提示
                if (filteredTracks.length > 100) {
                    if (trackSection) {
                        trackSection.textContent = `正在加载 ${filteredTracks.length} 首歌曲...`;
                    }
                    // 延迟渲染，避免页面卡顿
                    setTimeout(() => {
                        this.renderTrackList(filteredTracks, recentTracks);
                        if (trackSection) {
                            trackSection.textContent = `搜索到 ${filteredTracks.length} 首歌曲`;
                        }
                    }, 100);
                } else {
                    this.renderTrackList(filteredTracks, recentTracks);
                    if (trackSection) {
                        trackSection.textContent = `搜索到 ${filteredTracks.length} 首歌曲`;
                    }
                }
            }
            
        } catch (error) {
            console.error('首页搜索失败:', error);
            this.showError('搜索失败');
        }
    },
    
    // 清除搜索
    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        this.state.searchQuery = '';
        
        const clearSearch = document.getElementById('clearSearch');
        if (clearSearch) clearSearch.style.display = 'none';
        
        this.performSearch();
    },
    
    // 播放歌曲（增强版，支持播放上下文）
    playTrackFromList(playlist, index, context = null) {
        this.state.currentPlaylist = playlist;
        this.state.currentTrackIndex = index;
        
        // 🎯 设置播放上下文
        if (context) {
            this.state.playlistContext = {
                type: context.type,
                source: context.source,
                fullPlaylist: context.fullPlaylist || playlist,
                currentPage: context.currentPage || 1,
                totalPages: context.totalPages || 1
            };
            
            console.log('设置播放上下文:', this.state.playlistContext);
        }
        
        this.playCurrentTrack();
    },
    
    // 播放当前歌曲
    async playCurrentTrack() {
        if (this.state.currentTrackIndex < 0 || this.state.currentTrackIndex >= this.state.currentPlaylist.length) {
            return;
        }
        
        const track = this.state.currentPlaylist[this.state.currentTrackIndex];
        
        try {
            // 停止当前播放并等待完全停止
            if (!this.audioPlayer.paused) {
                this.audioPlayer.pause();
            }
            
            // 等待一小段时间确保之前的操作完成
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // 设置音频源
            this.audioPlayer.src = `/audios/${track.relative_path}`;
            
            // 等待音频准备就绪
            await new Promise((resolve, reject) => {
                const onCanPlay = () => {
                    this.audioPlayer.removeEventListener('canplay', onCanPlay);
                    this.audioPlayer.removeEventListener('error', onError);
                    resolve();
                };
                
                const onError = (error) => {
                    this.audioPlayer.removeEventListener('canplay', onCanPlay);
                    this.audioPlayer.removeEventListener('error', onError);
                    reject(error);
                };
                
                this.audioPlayer.addEventListener('canplay', onCanPlay);
                this.audioPlayer.addEventListener('error', onError);
                
                // 如果已经可以播放，直接resolve
                if (this.audioPlayer.readyState >= 3) {
                    this.audioPlayer.removeEventListener('canplay', onCanPlay);
                    this.audioPlayer.removeEventListener('error', onError);
                    resolve();
                }
            });
            
            // 现在安全地开始播放
            await this.audioPlayer.play();
            this.state.isPlaying = true;
            this.updatePlayButton();
            this.updateNowPlaying(track);
            this.updateTrackHighlight();
            
            // 确保在播放开始后也更新高亮（处理异步加载问题）
            setTimeout(() => {
                this.updateTrackHighlight();
            }, 100);
            
            // 再次确保高亮更新（处理DOM渲染延迟）
            setTimeout(() => {
                this.updateTrackHighlight();
            }, 500);
        } catch (error) {
            console.error('播放失败:', error);
            this.showToast(`播放失败：${error.message}`, 'error');
        }
    },
    
    // 更新正在播放信息
    updateNowPlaying(track) {
        const elements = {
            cover: document.getElementById('currentTrackCover'),
            title: document.getElementById('currentTrackTitle'),
            artist: document.getElementById('currentTrackArtist')
        };
        
        if (elements.cover) elements.cover.src = track.albumCover || '/static/images/default.jpg';
        if (elements.title) elements.title.textContent = track.title || '未知标题';
        if (elements.artist) elements.artist.textContent = track.artist || '未知艺术家';
    },
    
    // 🎯 获取当前播放列表的上下文信息
    getCurrentPlaylistContext(currentPageTracks) {
        const context = {
            type: null,
            source: null,
            fullPlaylist: currentPageTracks,
            currentPage: 1,
            totalPages: 1
        };
        
        // 根据当前视图确定上下文类型
        switch (this.state.currentView) {
            case 'tracks':
                context.type = 'all-tracks';
                context.fullPlaylist = this.state.allFilteredTracks;
                // 计算分页信息
                const perPage = 50;
                context.totalPages = Math.ceil(this.state.allFilteredTracks.length / perPage);
                // 通过当前显示的歌曲推算当前页码
                if (currentPageTracks.length > 0 && this.state.allFilteredTracks.length > 0) {
                    const firstTrackIndex = this.state.allFilteredTracks.findIndex(track => 
                        track.title === currentPageTracks[0].title && 
                        track.artist === currentPageTracks[0].artist
                    );
                    context.currentPage = Math.floor(firstTrackIndex / perPage) + 1;
                }
                break;
                
            case 'albumDetail':
                context.type = 'album';
                context.source = this.currentAlbum?.collection_id;
                context.fullPlaylist = this.currentAlbum?.tracks || currentPageTracks;
                break;
                
            case 'home':
                // 在首页，可能是最近添加的歌曲
                context.type = 'recent';
                // 🎯 对于首页，我们需要异步获取完整的最近歌曲列表
                // 暂时使用当前页面的歌曲，后续可以优化
                context.fullPlaylist = currentPageTracks;
                break;
                
            default:
                context.type = 'unknown';
                context.fullPlaylist = currentPageTracks;
                break;
        }
        
        return context;
    },
    
    // 获取当前页面显示的歌曲列表
    getCurrentPageTracks() {
        // 🎯 根据当前视图返回相应的歌曲列表
        if (this.state.currentView === 'tracks') {
            // 在全部歌曲页面，返回当前页的歌曲
    const trackItems = document.querySelectorAll('.track-item');
            const tracks = [];
            
            trackItems.forEach(item => {
                const titleElement = item.querySelector('.track-title');
                const artistElement = item.querySelector('.track-artist');
                
                if (titleElement && artistElement) {
                    // 尝试从全部过滤歌曲中找到匹配的完整信息
                    const title = titleElement.textContent.trim();
                    const artist = artistElement.textContent.trim();
                    
                    const fullTrack = this.state.allFilteredTracks.find(track => 
                        track.title === title && track.artist === artist
                    );
                    
                    if (fullTrack) {
                        tracks.push(fullTrack);
        } else {
                        // 如果找不到完整信息，创建基本信息
                        tracks.push({
                            title: title,
                            artist: artist,
                            audio_path: null
                        });
                    }
                }
            });
            
            return tracks;
        } else if (this.state.currentView === 'albumDetail' && this.currentAlbum) {
            // 在专辑详情页面，返回当前专辑的歌曲
            return this.currentAlbum.tracks || [];
        } else if (this.state.currentView === 'home') {
            // 🎯 在首页，获取最近添加的歌曲
            const trackItems = document.querySelectorAll('#recentTracks .track-item');
            const tracks = [];
            
            trackItems.forEach(item => {
                const titleElement = item.querySelector('.track-title');
                const artistElement = item.querySelector('.track-artist');
                
                if (titleElement && artistElement) {
                    tracks.push({
                        title: titleElement.textContent.trim(),
                        artist: artistElement.textContent.trim(),
                        audio_path: null // 首页可能没有完整的路径信息
                    });
                }
            });
            
            return tracks;
        }
        
        return [];
    },
    
    // 更新歌曲高亮（改进版，支持不同视图）
    updateTrackHighlight() {
        // 清除所有高亮
        document.querySelectorAll('.track-item.playing').forEach(item => {
            item.classList.remove('playing');
        });
        
        // 如果没有正在播放的歌曲，直接返回
        if (this.state.currentTrackIndex < 0 || !this.state.currentPlaylist.length) {
            return;
        }
        
        const currentTrack = this.state.currentPlaylist[this.state.currentTrackIndex];
        if (!currentTrack) return;
        

        
        // 🎯 关键修改：检查当前播放模式
        const isRandomMode = this.state.playMode === 'shuffle';
        
        // 🎯 如果是随机模式，需要检查当前播放的歌曲是否在当前显示的页面中
        // 🎯 但是在首页的最近添加列表中，不需要这个检查，因为它本身就是一个完整的播放上下文
        if (isRandomMode && this.state.currentView !== 'home') {
            // 获取当前页面显示的歌曲列表（用于比较）
            const currentPageTracks = this.getCurrentPageTracks();
            
            // 检查当前播放的歌曲是否在当前页面中
            const isTrackInCurrentPage = currentPageTracks.some(track => 
                track.title === currentTrack.title && 
                track.artist === currentTrack.artist &&
                // 🎯 如果页面歌曲没有audio_path信息，只比较标题和艺术家
                (track.audio_path === null || track.audio_path === currentTrack.audio_path)
            );
            
            // 如果当前播放的歌曲不在当前页面，就不显示任何高亮
            if (!isTrackInCurrentPage) {
                console.log('随机播放的歌曲不在当前页面，不显示高亮:', currentTrack.title);
                return;
            }
        }
        
        // 根据当前视图查找对应的歌曲项
        let currentItems;
        if (this.state.currentView === 'tracks') {
            currentItems = document.querySelectorAll('#trackList .track-item');
        } else if (this.state.currentView === 'home') {
            currentItems = document.querySelectorAll('#recentTracks .track-item');
        } else if (this.state.currentView === 'albumDetail') {
            currentItems = document.querySelectorAll('#albumTracks .track-item');
        } else {
            currentItems = document.querySelectorAll('.track-item');
        }
        
        currentItems.forEach((item, index) => {
            // 获取歌曲标题和艺术家信息
            const titleElement = item.querySelector('.track-title');
            const artistElement = item.querySelector('.track-artist');
            
            if (titleElement && artistElement) {
                const itemTitle = titleElement.textContent.trim();
                const itemArtist = artistElement.textContent.trim();
                const currentTitle = (currentTrack.title || '未知标题').trim();
                const currentArtist = (currentTrack.artist || '未知艺术家').trim();
                
                // 通过标题和艺术家匹配歌曲
                if (itemTitle === currentTitle && itemArtist === currentArtist) {
                    item.classList.add('playing');
                    console.log('高亮歌曲:', itemTitle, itemArtist);
                }
            }
        });
        
        // 如果没有找到匹配项，尝试通过索引匹配（作为备用方案）
        if (!document.querySelector('.track-item.playing')) {
            let trackItems;
            
            // 🎯 根据当前视图选择正确的歌曲项
            if (this.state.currentView === 'tracks') {
                trackItems = document.querySelectorAll('#trackList .track-item');
            } else if (this.state.currentView === 'home') {
                trackItems = document.querySelectorAll('#recentTracks .track-item');
            } else if (this.state.currentView === 'albumDetail') {
                trackItems = document.querySelectorAll('#albumTracks .track-item');
            }
            
            if (trackItems && trackItems[this.state.currentTrackIndex]) {
                trackItems[this.state.currentTrackIndex].classList.add('playing');
                console.log('通过索引高亮歌曲:', this.state.currentTrackIndex, '在', this.state.currentView);
            }
        }
    },

// 播放/暂停切换
    togglePlayPause() {
        if (!this.audioPlayer.src) return;
    
        if (this.state.isPlaying) {
            this.audioPlayer.pause();
            this.state.isPlaying = false;
    } else {
            this.audioPlayer.play();
            this.state.isPlaying = true;
        }
        
        this.updatePlayButton();
    },
    
    // 更新播放按钮（改进的双向同步）
    updatePlayButton() {
        const isPlaying = this.state.isPlaying;
        
        // 更新主播放按钮
        const playPauseBtn = document.getElementById('playPauseBtn');
        if (playPauseBtn) {
            const icon = playPauseBtn.querySelector('i');
            if (icon) {
                icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
            }
        }
        
        // 更新播放全部按钮（只在tracks视图时更新）
        const playAllBtn = document.getElementById('playAllTracksBtn');
        if (playAllBtn && this.state.currentView === 'tracks') {
            playAllBtn.innerHTML = isPlaying ? 
                '<i class="fas fa-pause"></i> 暂停播放' : 
                '<i class="fas fa-play"></i> 播放全部';
        }
        
        // 更新专辑播放按钮（只在专辑详情视图时更新）
        const playAlbumBtn = document.getElementById('playAlbumBtn');
        if (playAlbumBtn && this.state.currentView === 'albumDetail') {
            playAlbumBtn.innerHTML = isPlaying ? 
                '<i class="fas fa-pause"></i> 暂停' : 
                '<i class="fas fa-play"></i> 播放';
        }
        
        // 更新所有歌曲列表中的播放按钮状态
        this.updateTrackPlayButtons();
    },
    
    // 更新歌曲列表中的播放按钮状态
    updateTrackPlayButtons() {
        const trackItems = document.querySelectorAll('.track-item');
        trackItems.forEach((item, index) => {
            const playBtn = item.querySelector('.track-play-btn');
            if (playBtn) {
                const icon = playBtn.querySelector('i');
                if (icon) {
                    // 如果当前歌曲正在播放，显示暂停图标
                    if (this.state.isPlaying && this.state.currentTrackIndex === index) {
                        icon.className = 'fas fa-pause';
    } else {
                        icon.className = 'fas fa-play';
                    }
                }
            }
        });
    },
    
    // 上一首（基于播放上下文）
    async playPrevious() {
        if (this.state.playMode === 'shuffle') {
            // 🎯 根据上下文类型选择随机播放策略
            if (this.state.playlistContext.type === 'all-tracks') {
                // 全部歌曲保持全局随机播放
                await this.playRandomTrack();
            } else {
                // 专辑和最近添加使用上下文随机播放
                await this.playRandomTrackInContext();
            }
        } else {
            await this.playPreviousInContext();
        }
    },
    
    // 下一首（基于播放上下文）
    async playNext() {
        if (this.state.playMode === 'shuffle') {
            // 🎯 根据上下文类型选择随机播放策略
            if (this.state.playlistContext.type === 'all-tracks') {
                // 全部歌曲保持全局随机播放
                await this.playRandomTrack();
    } else {
                // 专辑和最近添加使用上下文随机播放
                await this.playRandomTrackInContext();
            }
        } else {
            await this.playNextInContext();
        }
    },
    
    // 🎯 基于上下文的上一首
    async playPreviousInContext() {
        const context = this.state.playlistContext;
        
        if (!context.fullPlaylist || context.fullPlaylist.length === 0) {
            console.log('没有完整的播放列表，使用当前播放列表');
            // 回退到原始逻辑
            if (this.state.currentPlaylist.length === 0) return;
            this.state.currentTrackIndex--;
            if (this.state.currentTrackIndex < 0) {
                this.state.currentTrackIndex = this.state.currentPlaylist.length - 1;
            }
            await this.playCurrentTrack();
            return;
        }
        
        // 在完整播放列表中找到当前歌曲的位置
        const currentTrack = this.state.currentPlaylist[this.state.currentTrackIndex];
        const globalIndex = context.fullPlaylist.findIndex(track => 
            track.title === currentTrack.title && 
            track.artist === currentTrack.artist &&
            track.audio_path === currentTrack.audio_path
        );
        
        if (globalIndex === -1) {
            console.log('在完整播放列表中找不到当前歌曲');
            return;
        }
        
        // 计算上一首的全局索引
        let prevGlobalIndex = globalIndex - 1;
        if (prevGlobalIndex < 0) {
            prevGlobalIndex = context.fullPlaylist.length - 1; // 循环到最后一首
        }
        
        const prevTrack = context.fullPlaylist[prevGlobalIndex];
        
        // 检查上一首是否在当前页面
        const prevIndexInCurrentPage = this.state.currentPlaylist.findIndex(track =>
            track.title === prevTrack.title && 
            track.artist === prevTrack.artist &&
            track.audio_path === prevTrack.audio_path
        );
        
        if (prevIndexInCurrentPage !== -1) {
            // 在当前页面，直接播放
            this.state.currentTrackIndex = prevIndexInCurrentPage;
            await this.playCurrentTrack();
        } else {
            // 需要切换页面或更新播放列表
            await this.switchToTrackInContext(prevTrack, prevGlobalIndex);
        }
        
        // 延迟更新高亮
        setTimeout(() => {
            this.updateTrackHighlight();
        }, 200);
    },
    
    // 🎯 基于上下文的下一首
    async playNextInContext() {
        const context = this.state.playlistContext;
        
        if (!context.fullPlaylist || context.fullPlaylist.length === 0) {
            console.log('没有完整的播放列表，使用当前播放列表');
            // 回退到原始逻辑
            if (this.state.currentPlaylist.length === 0) return;
            this.state.currentTrackIndex++;
            if (this.state.currentTrackIndex >= this.state.currentPlaylist.length) {
                this.state.currentTrackIndex = 0; // 循环到第一首
            }
            await this.playCurrentTrack();
            return;
        }
        
        // 在完整播放列表中找到当前歌曲的位置
        const currentTrack = this.state.currentPlaylist[this.state.currentTrackIndex];
        const globalIndex = context.fullPlaylist.findIndex(track => 
            track.title === currentTrack.title && 
            track.artist === currentTrack.artist &&
            track.audio_path === currentTrack.audio_path
        );
        
        if (globalIndex === -1) {
            console.log('在完整播放列表中找不到当前歌曲');
            return;
        }
        
        // 计算下一首的全局索引
        let nextGlobalIndex = globalIndex + 1;
        if (nextGlobalIndex >= context.fullPlaylist.length) {
            nextGlobalIndex = 0; // 循环到第一首
        }
        
        const nextTrack = context.fullPlaylist[nextGlobalIndex];
        
        // 检查下一首是否在当前页面
        const nextIndexInCurrentPage = this.state.currentPlaylist.findIndex(track =>
            track.title === nextTrack.title && 
            track.artist === nextTrack.artist &&
            track.audio_path === nextTrack.audio_path
        );
        
        if (nextIndexInCurrentPage !== -1) {
            // 在当前页面，直接播放
            this.state.currentTrackIndex = nextIndexInCurrentPage;
            await this.playCurrentTrack();
        } else {
            // 需要切换页面或更新播放列表
            await this.switchToTrackInContext(nextTrack, nextGlobalIndex);
        }
        
        // 延迟更新高亮
        setTimeout(() => {
            this.updateTrackHighlight();
        }, 200);
    },
    
    // 🎯 基于上下文的随机播放
    async playRandomTrackInContext() {
        const context = this.state.playlistContext;
        
        if (!context.fullPlaylist || context.fullPlaylist.length === 0) {
            console.log('没有完整的播放列表，回退到全局随机播放');
            await this.playRandomTrack();
            return;
        }
        
        // 在当前上下文的完整播放列表中随机选择
        const randomIndex = Math.floor(Math.random() * context.fullPlaylist.length);
        const randomTrack = context.fullPlaylist[randomIndex];
        
        console.log(`在${context.type}上下文中随机播放:`, randomTrack.title);
        
        // 检查随机歌曲是否在当前页面
        const randomIndexInCurrentPage = this.state.currentPlaylist.findIndex(track =>
            track.title === randomTrack.title && 
            track.artist === randomTrack.artist &&
            track.audio_path === randomTrack.audio_path
        );
        
        if (randomIndexInCurrentPage !== -1) {
            // 在当前页面，直接播放
            this.state.currentTrackIndex = randomIndexInCurrentPage;
            await this.playCurrentTrack();
        } else {
            // 需要切换页面或更新播放列表
            await this.switchToTrackInContext(randomTrack, randomIndex);
        }
        
        // 显示提示
        this.showToast(`${context.type === 'album' ? '专辑内' : context.type === 'recent' ? '最近添加中' : '当前列表'}随机播放: ${randomTrack.title}`, 'info');
        
        // 延迟更新高亮
        setTimeout(() => {
            this.updateTrackHighlight();
        }, 200);
    },
    
    // 🎯 在上下文中切换到指定歌曲
    async switchToTrackInContext(targetTrack, globalIndex) {
        const context = this.state.playlistContext;
        
        switch (context.type) {
            case 'all-tracks':
                // 计算目标歌曲所在的页码
                const perPage = 50;
                const targetPage = Math.floor(globalIndex / perPage) + 1;
                
                if (targetPage !== context.currentPage) {
                    // 需要切换页面
                    const success = await this.loadNextPageForPlayback(targetPage);
                    if (success) {
                        context.currentPage = targetPage;
                        // 在新页面中找到目标歌曲
                        const indexInNewPage = this.state.currentPlaylist.findIndex(track =>
                            track.title === targetTrack.title && 
                            track.artist === targetTrack.artist &&
                            track.audio_path === targetTrack.audio_path
                        );
                        this.state.currentTrackIndex = indexInNewPage !== -1 ? indexInNewPage : 0;
                    }
                } else {
                    // 在当前页面，直接播放
                    const indexInCurrentPage = globalIndex % perPage;
                    this.state.currentTrackIndex = indexInCurrentPage;
                }
                break;
                
            case 'album':
            case 'recent':
            default:
                // 对于专辑或其他类型，直接设置播放列表
                this.state.currentPlaylist = [targetTrack];
                this.state.currentTrackIndex = 0;
                break;
        }
        
        await this.playCurrentTrack();
    },
    
    // 切换播放模式（合并后的单一按钮）
    togglePlayMode() {
        switch(this.state.playMode) {
            case 'sequence':
                this.state.playMode = 'shuffle';
                break;
            case 'shuffle':
                this.state.playMode = 'repeat-one';
                break;
            case 'repeat-one':
                this.state.playMode = 'sequence';
                break;
            default:
                this.state.playMode = 'sequence';
        }
        this.updatePlayModeButton();
    },
    
    // 更新播放模式按钮
    updatePlayModeButton() {
        const playModeBtn = document.getElementById('playModeBtn');
        if (!playModeBtn) return;
        
        const icon = playModeBtn.querySelector('i');
        if (!icon) return;
        
        // 移除所有活跃状态
        playModeBtn.classList.remove('active');
        
        switch(this.state.playMode) {
            case 'sequence':
                icon.className = 'fas fa-arrow-right';
                playModeBtn.title = '播放模式：顺序播放';
                break;
            case 'shuffle':
                icon.className = 'fas fa-random';
                playModeBtn.title = '播放模式：随机播放';
                playModeBtn.classList.add('active');
                break;
            case 'repeat-one':
                icon.className = 'fas fa-redo-alt';
                playModeBtn.title = '播放模式：单曲循环';
                playModeBtn.classList.add('active');
                break;
        }
    },
    
    // 处理歌曲结束
    handleTrackEnd() {
        switch(this.state.playMode) {
            case 'repeat-one':
                this.audioPlayer.currentTime = 0;
                this.audioPlayer.play();
                // 单曲循环时也要更新高亮
                setTimeout(() => {
                    this.updateTrackHighlight();
                }, 100);
                break;
            case 'shuffle':
                // 随机播放模式，直接调用playNext会自动更新高亮
                this.playNext();
                break;
            case 'sequence':
                if (this.state.currentTrackIndex < this.state.currentPlaylist.length - 1) {
                    this.playNext();
    } else {
                    // 顺序播放到当前页面最后一首，尝试自动跳转到下一页
                    if (this.state.currentView === 'tracks') {
                        this.loadNextPageForPlayback(this.state.currentPage + 1).then(hasNextPage => {
                            if (hasNextPage) {
                                // 成功加载下一页，自动播放第一首
                                this.state.currentTrackIndex = 0;
                                this.state.currentPage = this.state.currentPage + 1;
                                this.showToast(`自动跳转到第${this.state.currentPage}页并继续播放`, 'info');
                                this.playCurrentTrack();
                            } else {
                                // 没有下一页了，停止播放
                                this.state.isPlaying = false;
                                this.updatePlayButton();
                                this.showToast('已播放完所有歌曲', 'info');
                                // 清除高亮
                                document.querySelectorAll('.track-item.playing').forEach(item => {
                                    item.classList.remove('playing');
                                });
                            }
                        });
                    } else {
                        // 不在tracks视图，停止播放
                        this.state.isPlaying = false;
                        this.updatePlayButton();
                        // 清除高亮
                        document.querySelectorAll('.track-item.playing').forEach(item => {
                            item.classList.remove('playing');
                        });
                    }
                }
                break;
            default:
                this.state.isPlaying = false;
                this.updatePlayButton();
                // 清除高亮
                document.querySelectorAll('.track-item.playing').forEach(item => {
                    item.classList.remove('playing');
                });
        }
    },
    
    // 播放/暂停全部歌曲（双向绑定）
    playAllTracks() {
        if (this.state.isPlaying) {
            // 当前正在播放，点击暂停
            this.togglePlayPause();
    } else {
            // 当前未播放，开始播放全部歌曲
            if (this.state.currentView === 'tracks') {
                this.getAllTracksData().then(tracks => {
                    if (tracks && tracks.length > 0) {
                        this.playTrackFromList(tracks, 0);
                    }
                });
            } else if (this.state.currentView === 'albums') {
                // 在专辑视图播放推荐专辑的第一首歌
                this.loadRecommendedAlbums().then(() => {
                    // 这里可以添加播放第一个专辑的逻辑
                });
            }
        }
    },
    
    // 播放/暂停当前专辑（双向绑定）
    playCurrentAlbum() {
        if (this.state.isPlaying) {
            // 当前正在播放，点击暂停
            this.togglePlayPause();
    } else {
            // 当前未播放，开始播放专辑
            if (this.currentAlbum && this.currentAlbum.tracks && this.currentAlbum.tracks.length > 0) {
                this.playTrackFromList(this.currentAlbum.tracks, 0);
            } else {
                this.showError('专辑无可播放的歌曲');
            }
        }
    },
    
    // 获取并缓存全局歌曲数据
    async loadGlobalPlaylist() {
        if (this.state.globalPlaylist.length > 0) {
            return this.state.globalPlaylist; // 如果已经加载过，直接返回
        }
        
        try {
            const response = await fetch('/api/audio_collections?page=1&per_page=100');
            const data = await response.json();
            
            if (data.status === 'success') {
                const allTracks = [];
                
                for (const collection of data.data.collections) {
                    try {
                        const albumResponse = await fetch(`/api/audio_collection/${collection.collection_id}`);
                        const albumData = await albumResponse.json();
                        
                        if (albumData.status === 'success' && albumData.data.tracks) {
                            albumData.data.tracks.forEach((track, index) => {
                                allTracks.push({
                                    ...track,
                                    album: albumData.data.collection_name,
                                    albumCover: albumData.data.cover_path,
                                    globalIndex: allTracks.length, // 全局索引
                                    collectionId: collection.collection_id,
                                    trackIndex: index
                                });
                            });
                        }
                    } catch (err) {
                        console.error(`获取专辑 ${collection.collection_id} 失败:`, err);
                    }
                }
                
                this.state.globalPlaylist = allTracks;
                return allTracks;
            }
        } catch (error) {
            console.error('获取全局歌曲数据失败:', error);
            return [];
        }
    },
    
    // 获取当前歌曲数据（保持兼容性）
    async getAllTracksData() {
        return await this.loadGlobalPlaylist();
    },
    
    // 全局随机播放
    async playRandomTrack() {
        const globalPlaylist = await this.loadGlobalPlaylist();
        if (globalPlaylist.length === 0) return;
        
        // 随机选择一首歌曲
        const randomIndex = Math.floor(Math.random() * globalPlaylist.length);
        const randomTrack = globalPlaylist[randomIndex];
        
        console.log('随机播放:', randomTrack.title, '全局索引:', randomIndex);
        
        // 更新全局状态
        this.state.globalTrackIndex = randomIndex;
        this.state.currentPlaylist = [randomTrack]; // 设置为单首歌曲的播放列表
        this.state.currentTrackIndex = 0;
        
        // 播放歌曲
        await this.playCurrentTrack();
        
        // 检查是否需要跳转到对应的页面以显示高亮
        await this.navigateToTrack(randomTrack);
    },
    
        // 导航到特定歌曲所在的页面（用于显示高亮）
    async navigateToTrack(track) {
        // 🎯 随机播放时不跳转页面，只检查当前页是否有该歌曲
        if (this.state.currentView === 'tracks') {
            // 延迟高亮更新，让updateTrackHighlight自己判断是否需要高亮
    setTimeout(() => {
                this.updateTrackHighlight();
            }, 100);
        } else if (this.state.currentView === 'albumDetail' && track.collectionId) {
            // 如果在专辑详情页，检查是否是当前专辑的歌曲
            if (this.currentAlbum && this.currentAlbum.collection_id === track.collectionId) {
                // 是当前专辑的歌曲，直接高亮
        setTimeout(() => {
                    this.updateTrackHighlight();
    }, 100);
            }
            // 🎯 如果不是当前专辑的歌曲，随机播放时不跳转，只是不高亮
        }
        
        // 显示Toast提示当前播放的歌曲
        this.showToast(`随机播放: ${track.title} - ${track.artist}`, 'info');
    },
    
    // 为播放加载下一页（专用于顺序播放的翻页）
    async loadNextPageForPlayback(page) {
        try {
            // 🎯 使用当前过滤后的歌曲数据进行分页
            const allTracks = this.state.allFilteredTracks;
            
            if (allTracks.length === 0) return false;
            
            // 🎯 使用与loadAllTracks相同的分页逻辑
            const perPage = 50;
            const startIndex = (page - 1) * perPage;
            const endIndex = startIndex + perPage;
            
            // 检查是否有下一页的歌曲
            if (startIndex >= allTracks.length) {
                return false; // 没有更多歌曲了
            }
            
            // 获取下一页的歌曲
            const nextPageTracks = allTracks.slice(startIndex, endIndex);
            
            if (nextPageTracks.length > 0) {
                // 更新当前播放列表为下一页的歌曲
                this.state.currentPlaylist = nextPageTracks;
                
                // 更新UI显示下一页的歌曲列表
                const container = document.getElementById('trackList');
                this.renderTrackList(nextPageTracks, container);
                
                // 更新分页信息
                const totalPages = Math.ceil(allTracks.length / perPage);
                const paginationData = {
                    current_page: page,
                    total_pages: totalPages,
                    total_items: allTracks.length,
                    per_page: perPage
                };
                this.renderPagination(paginationData, 'tracksPagination');
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('加载下一页失败:', error);
            return false;
        }
    },
    
    // 绑定进度条拖拽事件
    bindProgressDrag(progressBar) {
        let isDragging = false;
        let wasPlaying = false;
        
        const startDrag = (e) => {
            isDragging = true;
            wasPlaying = this.state.isPlaying;
            if (wasPlaying) {
                this.audioPlayer.pause();
            }
            this.updateProgressFromEvent(e, progressBar);
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', endDrag);
            e.preventDefault();
        };
        
        const onDrag = (e) => {
            if (!isDragging) return;
            this.updateProgressFromEvent(e, progressBar);
            e.preventDefault();
        };
        
        const endDrag = (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.updateProgressFromEvent(e, progressBar);
            if (wasPlaying) {
                this.audioPlayer.play();
            }
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', endDrag);
            e.preventDefault();
        };
        
        // 鼠标事件
        progressBar.addEventListener('mousedown', startDrag);
        
        // 触摸事件（移动端支持）
        progressBar.addEventListener('touchstart', (e) => {
            startDrag(e.touches[0]);
        });
        
        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                onDrag(e.touches[0]);
            }
        });
        
        document.addEventListener('touchend', (e) => {
            if (isDragging) {
                endDrag(e.changedTouches[0]);
            }
        });
    },
    
    // 从事件更新进度
    updateProgressFromEvent(event, progressBar) {
        if (!this.audioPlayer.duration) return;
        
        const rect = progressBar.getBoundingClientRect();
        let percent = (event.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent)); // 限制在0-1之间
        
        this.audioPlayer.currentTime = percent * this.audioPlayer.duration;
        this.updateProgressDisplay();
    },
    
    // 进度条控制（点击）
    seekTo(event) {
        const progressBar = document.getElementById('progressBar');
        if (!progressBar) return;
        
        this.updateProgressFromEvent(event, progressBar);
    },
    
    // 更新进度显示
    updateProgressDisplay() {
        if (this.audioPlayer.duration && !isNaN(this.audioPlayer.duration)) {
            const percent = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
            const progressFill = document.getElementById('progressFill');
            const progressHandle = document.getElementById('progressHandle');
            const currentTime = document.getElementById('currentTime');
            
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressHandle) progressHandle.style.left = `${percent}%`;
            if (currentTime) {
                currentTime.textContent = this.formatTime(this.audioPlayer.currentTime);
                // 确保元素可见
                currentTime.style.display = 'block';
            }
        }
    },
    
    // 更新进度（原有函数，保持兼容）
    updateProgress() {
        this.updateProgressDisplay();
    },
    
    // 更新总时长
    updateDuration() {
        const totalTime = document.getElementById('totalTime');
        if (totalTime && this.audioPlayer.duration && !isNaN(this.audioPlayer.duration)) {
            totalTime.textContent = this.formatTime(this.audioPlayer.duration);
            // 确保元素可见
            totalTime.style.display = 'block';
        }
    },
    
    // 切换静音
    toggleMute() {
        this.state.isMuted = !this.state.isMuted;
        this.audioPlayer.muted = this.state.isMuted;
        this.updateVolumeButton();
    },
    
    // 绑定音量拖拽事件
    bindVolumeDrag(volumeSlider) {
        let isDragging = false;
        
        const startDrag = (e) => {
            isDragging = true;
            this.updateVolumeFromEvent(e, volumeSlider);
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', endDrag);
            e.preventDefault();
        };
        
        const onDrag = (e) => {
            if (!isDragging) return;
            this.updateVolumeFromEvent(e, volumeSlider);
            e.preventDefault();
        };
        
        const endDrag = (e) => {
            isDragging = false;
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', endDrag);
            e.preventDefault();
        };
        
        // 鼠标事件
        volumeSlider.addEventListener('mousedown', startDrag);
        
        // 触摸事件
        volumeSlider.addEventListener('touchstart', (e) => {
            startDrag(e.touches[0]);
        });
        
        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                onDrag(e.touches[0]);
            }
        });
        
        document.addEventListener('touchend', (e) => {
            if (isDragging) {
                endDrag(e.changedTouches[0]);
            }
        });
    },
    
    // 处理音量滚轮事件
    handleVolumeWheel(event) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.05 : 0.05; // 向下滚动减小音量，向上滚动增大音量
        this.state.volume = Math.max(0, Math.min(1, this.state.volume + delta));
        this.audioPlayer.volume = this.state.volume;
        this.state.isMuted = false; // 滚轮调节时取消静音
        this.audioPlayer.muted = false;
        this.updateVolumeDisplay();
    },
    
    // 从事件更新音量
    updateVolumeFromEvent(event, volumeSlider) {
        const rect = volumeSlider.getBoundingClientRect();
        let percent = (event.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent)); // 限制在0-1之间
        
        this.state.volume = percent;
        this.audioPlayer.volume = this.state.volume;
        this.state.isMuted = false; // 拖拽调节时取消静音
        this.audioPlayer.muted = false;
        this.updateVolumeDisplay();
    },
    
    // 设置音量（点击）
    setVolume(event) {
        const volumeSlider = document.getElementById('volumeSlider');
        if (!volumeSlider) return;
        
        this.updateVolumeFromEvent(event, volumeSlider);
    },
    
    // 更新音量显示
    updateVolumeDisplay() {
        const volumeFill = document.getElementById('volumeFill');
        const volumeHandle = document.getElementById('volumeHandle');
        
        if (volumeFill) {
            volumeFill.style.width = `${this.state.volume * 100}%`;
        }
        if (volumeHandle) {
            volumeHandle.style.left = `${this.state.volume * 100}%`;
        }
        this.updateVolumeButton();
    },
    
    // 更新音量按钮
    updateVolumeButton() {
        const volumeBtn = document.getElementById('volumeBtn');
        if (!volumeBtn) return;
        
        const icon = volumeBtn.querySelector('i');
        if (icon) {
            if (this.state.isMuted || this.state.volume === 0) {
                icon.className = 'fas fa-volume-mute';
            } else if (this.state.volume < 0.5) {
                icon.className = 'fas fa-volume-down';
        } else {
                icon.className = 'fas fa-volume-up';
            }
        }
    },
    
    // 侧边栏切换（优化移动端体验）
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('audioSidebarOverlay');
        
        if (sidebar) {
            const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');
            
            if (isCurrentlyCollapsed) {
                // 展开侧边栏
                sidebar.classList.remove('collapsed');
                if (overlay) {
                    overlay.classList.add('active');
                }
        } else {
                // 折叠侧边栏
                sidebar.classList.add('collapsed');
                if (overlay) {
                    overlay.classList.remove('active');
                }
            }
            
            // 保存状态到localStorage
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        }
    },
    
    // 折叠侧边栏（专用方法）
    collapseSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('audioSidebarOverlay');
        
        if (sidebar) {
            sidebar.classList.add('collapsed');
            if (overlay) {
                overlay.classList.remove('active');
            }
            
            // 保存状态
            localStorage.setItem('sidebarCollapsed', true);
        }
    },
    
    // 主题切换（已移除，使用全局主题切换）
    toggleTheme() {
        // 音频页面不再独立切换主题，使用导航栏的全局主题切换
        console.log('请使用导航栏的主题切换按钮');
    },
    
    // 更新主题图标
    updateThemeIcon(theme) {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            if (icon) {
                icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
        }
    },
    

    
    // 渲染分页
    renderPagination(pagination, containerId) {
        const container = document.getElementById(containerId);
        if (!container || !pagination) return;
        
        container.innerHTML = '';
        
        const { current_page, total_pages } = pagination;
        
        // 上一页按钮
        if (current_page > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.className = 'pagination-btn';
            prevBtn.textContent = '上一页';
            prevBtn.addEventListener('click', () => this.loadPage(current_page - 1));
            container.appendChild(prevBtn);
        }
        
        // 页码按钮
        const startPage = Math.max(1, current_page - 2);
        const endPage = Math.min(total_pages, startPage + 4);
        
    for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `pagination-btn ${i === current_page ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => this.loadPage(i));
            container.appendChild(pageBtn);
        }
        
        // 下一页按钮
        if (current_page < total_pages) {
            const nextBtn = document.createElement('button');
            nextBtn.className = 'pagination-btn';
            nextBtn.textContent = '下一页';
            nextBtn.addEventListener('click', () => this.loadPage(current_page + 1));
            container.appendChild(nextBtn);
        }
    },
    
    // 加载指定页面
    loadPage(page) {
        this.state.currentPage = page;
        
        switch(this.state.currentView) {
            case 'albums':
                this.loadAlbums(page);
                break;
            case 'tracks':
                this.loadAllTracks(page);
                break;
        }
    },
    
    // 工具函数：格式化时间
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
    
    // 工具函数：格式化时长
    formatDuration(seconds) {
        return this.formatTime(seconds);
    },
    
    // 显示错误信息
    showError(message) {
        console.error(message);
        
        // 创建更美观的错误提示
        this.showToast(message, 'error');
    },
    
    // 显示Toast提示
    showToast(message, type = 'info') {
        // 移除现有的toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // 创建新的toast
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // 添加到页面
        document.body.appendChild(toast);
        
        // 动画显示
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        // 3秒后自动消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 3000);
    }
};

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    AudioApp.init();
});

// 导出到全局作用域供调试使用
window.AudioApp = AudioApp;
