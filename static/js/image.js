// static/js/image.js
// 全局变量
let currentPage = 1;
let totalPages = 1;
let searchQuery = '';
let isSearchMode = false;
// 每页显示数量由后端env_loader.py配置决定，默认21个图片集

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', initImagePage);

// 初始化图片集页面
function initImagePage() {
    // 初始化深色模式
    initThemeMode();
    
    // 加载图片集列表
    loadImageCollections(1);
    
    // 设置搜索按钮事件
    document.getElementById('searchButton').addEventListener('click', handleSearch);
    
    // 设置搜索输入框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // 设置跳转页面按钮事件
    document.getElementById('jumpButton').addEventListener('click', function() {
        const pageInput = document.getElementById('pageInput');
        const pageNumber = parseInt(pageInput.value);
        
        if (pageNumber && pageNumber > 0 && pageNumber <= totalPages) {
            loadImageCollections(pageNumber);
            pageInput.value = '';
        } else {
            alert(`请输入有效的页码（1-${totalPages}）`);
        }
    });
}

// 处理搜索事件
function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    
    if (query) {
        searchQuery = query;
        isSearchMode = true;
        loadImageCollections(1, true);
    } else {
        // 如果搜索框为空，恢复正常加载
        if (isSearchMode) {
            searchQuery = '';
            isSearchMode = false;
            loadImageCollections(1);
        }
    }
}

// 加载图片集列表
function loadImageCollections(page, isSearch = false) {
    currentPage = page;
    const imageGrid = document.querySelector('.image-grid');
    const searchResults = document.querySelector('.search-results');
    const searchContainer = document.querySelector('.search-results-container');
    const gridContainer = document.querySelector('.image-grid-container');
    
    // 显示加载信息
    const container = isSearch ? searchResults : imageGrid;
    container.innerHTML = '<div class="loading-message">加载中...</div>';
    
    // 显示正确的容器
    if (isSearch) {
        searchContainer.style.display = 'block';
        gridContainer.style.display = 'none';
    } else {
        searchContainer.style.display = 'none';
        gridContainer.style.display = 'block';
    }
    
    // 构建API请求URL，不指定per_page参数，使用后端配置的值
    let url = `/api/image_collections?page=${page}`;
    if (isSearch && searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`;
    }
    
    // 更新浏览器历史
    updateUrlParams({
        page: page,
        search: searchQuery
    });
    
    // 发送API请求
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                displayImageCollections(data.data.collections, container);
                updatePagination(data.data.pagination);
                
                // 滚动到页面顶部
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            } else {
                showError('加载图片集失败：' + data.message);
            }
        })
        .catch(error => {
            showError('请求失败：' + error.message);
        });
}

// 显示图片集列表
function displayImageCollections(collections, container) {
    console.time('displayImageCollections');
    container.innerHTML = '';
    
    if (!collections || collections.length === 0) {
        container.innerHTML = '<div class="no-results">暂无图片集</div>';
        console.timeEnd('displayImageCollections');
        return;
    }
    
    // 获取默认图片路径
    const defaultImagePath = '/static/images/default.jpg';
    
    // 创建一个文档片段，减少DOM重绘次数
    const fragment = document.createDocumentFragment();
    
    // 批量创建所有卡片
    collections.forEach((collection, index) => {
        const imageCard = document.createElement('div');
        imageCard.className = 'image-card';
        imageCard.setAttribute('data-id', collection.collection_id);
        
        // 构建缩略图URL
        let thumbnailPath = defaultImagePath;
        
        // 使用服务器返回的封面路径
        if (collection.cover_path) {
            thumbnailPath = collection.cover_path;
            console.log(`[${index+1}/${collections.length}] 图集 ${collection.collection_name} 使用封面图: ${thumbnailPath}`);
        } else {
            console.log(`[${index+1}/${collections.length}] 图集 ${collection.collection_name} 没有封面图，使用默认图片`);
        }
        
        imageCard.innerHTML = `
            <div class="image-thumbnail-container">
                <img class="image-thumbnail" src="${defaultImagePath}" data-src="${thumbnailPath}" alt="${collection.collection_name}">
            </div>
            <div class="image-info">
                <div class="image-title">${collection.collection_name}</div>
                <div class="image-count">
                    <i class="fas fa-images"></i>
                    ${collection.image_count || '未知'}P
                </div>
            </div>
        `;
        
        // 添加点击事件
        imageCard.addEventListener('click', function() {
            // 跳转到图片集详情页
            window.location.href = `/show_image?id=${collection.collection_id}`;
        });
        
        fragment.appendChild(imageCard);
    });
    
    // 一次性添加所有卡片到DOM
    container.appendChild(fragment);
    
    // 初始化图片延迟加载
    initDeferredImageLoading();
    console.timeEnd('displayImageCollections');
}

// 优化的图片延迟加载
function initDeferredImageLoading() {
    console.time('initDeferredImageLoading');
    const lazyImages = document.querySelectorAll('img[data-src]');
    console.log(`需要延迟加载的图片数量: ${lazyImages.length}`);
    
    // 创建一个计数器来跟踪加载情况
    let loadedCount = 0;
    let errorCount = 0;
    const totalCount = lazyImages.length;
    
    // 默认图片路径
    const defaultImagePath = '/static/images/default.jpg';
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    
                    // 设置加载和错误处理
                    img.onload = function() {
                        loadedCount++;
                        this.style.opacity = 1;
                        console.log(`图片加载成功 [${loadedCount+errorCount}/${totalCount}]: ${src}`);
                    };
                    
                    img.onerror = function() {
                        errorCount++;
                        this.src = defaultImagePath;
                        this.style.opacity = 1;
                        console.error(`图片加载失败 [${loadedCount+errorCount}/${totalCount}]: ${src}`);
                    };
                    
                    // 延迟设置src，按批次加载
                    setTimeout(() => {
                        img.src = src;
                    }, 150 * Math.floor(Array.from(lazyImages).indexOf(img) / 5));
                    
                    // 取消观察
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '200px', // 提前200像素开始加载
            threshold: 0.01      // 只需要1%可见就开始加载
        });
        
        lazyImages.forEach(img => {
            imageObserver.observe(img);
        });
    } else {
        // 降级处理：批量加载图片，避免同时请求所有图片
        lazyImages.forEach((img, index) => {
            const src = img.getAttribute('data-src');
            
            img.onload = function() {
                loadedCount++;
                this.style.opacity = 1;
                console.log(`图片加载成功 [${loadedCount+errorCount}/${totalCount}]: ${src}`);
            };
            
            img.onerror = function() {
                errorCount++;
                this.src = defaultImagePath;
                this.style.opacity = 1;
                console.error(`图片加载失败 [${loadedCount+errorCount}/${totalCount}]: ${src}`);
            };
            
            // 分批次加载图片，每批5张，每批间隔150毫秒
            setTimeout(() => {
                img.src = src;
            }, 150 * Math.floor(index / 5));
        });
    }
    console.timeEnd('initDeferredImageLoading');
}

// 更新分页控件
function updatePagination(pagination) {
    if (!pagination) return;
    
    totalPages = pagination.total_pages;
    const currentPage = pagination.current_page;
    const totalItems = pagination.total_items;
    
    // 更新分页按钮状态
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
    
    // 更新页码显示
    const pageNumbers = document.querySelector('.page-numbers');
    pageNumbers.innerHTML = '';
    
    // 计算应该显示的页码范围
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    // 调整开始页码，确保始终显示5个页码（如果可能）
    if (endPage - startPage < 4 && startPage > 1) {
        startPage = Math.max(1, endPage - 4);
    }
    
    // 添加第一页按钮
    if (startPage > 1) {
        addPageNumber(pageNumbers, 1);
        
        // 添加省略号
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '...';
            pageNumbers.appendChild(ellipsis);
        }
    }
    
    // 添加中间页码
    for (let i = startPage; i <= endPage; i++) {
        addPageNumber(pageNumbers, i);
    }
    
    // 添加最后一页按钮
    if (endPage < totalPages) {
        // 添加省略号
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '...';
            pageNumbers.appendChild(ellipsis);
        }
        
        addPageNumber(pageNumbers, totalPages);
    }
    
    // 更新分页信息
    const paginationInfo = document.querySelector('.pagination-info');
    paginationInfo.textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页，${totalItems} 个图片集`;
}

// 添加页码按钮
function addPageNumber(container, pageNum) {
    const pageElement = document.createElement('div');
    pageElement.className = 'page-number';
    if (pageNum === currentPage) {
        pageElement.classList.add('active');
    }
    pageElement.textContent = pageNum;
    pageElement.addEventListener('click', () => loadImageCollections(pageNum, isSearchMode));
    container.appendChild(pageElement);
}

// 上一页
function prevPage() {
    if (currentPage > 1) {
        loadImageCollections(currentPage - 1, isSearchMode);
    }
}

// 下一页
function nextPage() {
    if (currentPage < totalPages) {
        loadImageCollections(currentPage + 1, isSearchMode);
    }
}

// 更新URL参数
function updateUrlParams(params) {
    const url = new URL(window.location.href);
    
    // 更新或添加参数
    Object.keys(params).forEach(key => {
        if (params[key]) {
            url.searchParams.set(key, params[key]);
        } else {
            url.searchParams.delete(key);
        }
    });
    
    // 更新浏览器历史
    window.history.replaceState({}, document.title, url.toString());
}

// 初始化主题模式
function initThemeMode() {
    // 使用全局主题，确保与navbar.js同步
    const globalTheme = localStorage.getItem('globalTheme') || 'dark';
    // 确保与全局主题同步
    if (document.documentElement.getAttribute('data-theme') !== globalTheme) {
        document.documentElement.setAttribute('data-theme', globalTheme);
        document.body.setAttribute('data-theme', globalTheme);
    }
}

// 切换深色/浅色模式（已移除，使用全局主题切换）
function toggleTheme() {
    // 图片页面不再独立切换主题，使用导航栏的全局主题切换
    console.log('请使用导航栏的主题切换按钮');
}

// 更新主题图标
function updateThemeIcon(theme) {
    const iconElement = document.querySelector('.theme-toggle i');
    if (iconElement) {
        if (theme === 'dark') {
            iconElement.className = 'fas fa-sun';
        } else {
            iconElement.className = 'fas fa-moon';
        }
    }
}

// 显示错误消息
function showError(message) {
    const container = isSearchMode 
        ? document.querySelector('.search-results') 
        : document.querySelector('.image-grid');
        
    container.innerHTML = `<div class="error-message">${message}</div>`;
}
