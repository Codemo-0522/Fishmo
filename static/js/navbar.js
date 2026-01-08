// 导航栏相关JavaScript功能

// 全局主题管理
const GlobalTheme = {
    // 初始化主题
    init() {
        // 获取保存的主题或默认使用深色主题
        const savedTheme = localStorage.getItem('globalTheme') || 'dark';
        console.log('初始化主题:', savedTheme); // 调试日志
        this.applyTheme(savedTheme);
        // 延迟更新图标和绑定事件，等待DOM元素加载
        setTimeout(() => {
            this.updateThemeIcon(savedTheme);
            this.bindEvents();
        }, 0);
    },

    // 应用主题到页面
    applyTheme(theme) {
        console.log('应用主题:', theme); // 调试日志
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('globalTheme', theme);
        console.log('DOM元素主题属性:', document.documentElement.getAttribute('data-theme')); // 调试日志
    },

    // 更新主题图标
    updateThemeIcon(theme) {
        const themeToggle = document.getElementById('globalThemeToggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            if (icon) {
                icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
        }
    },

    // 切换主题
    toggle() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        this.updateThemeIcon(newTheme);
    },

    // 绑定事件
    bindEvents() {
        const themeToggle = document.getElementById('globalThemeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggle();
            });
        }
    }
};

//导航栏隐藏
window.onscroll = function () {
    const topBar = document.querySelector('.top-bar');
    const currentScrollPos = window.pageYOffset;
    if (currentScrollPos === 0) {
        // 页面处于顶部，显示导航栏
        topBar.style.transform = 'translateY(0)';
    } else {
        // 页面不在顶部，隐藏导航栏
        topBar.style.transform = 'translateY(-100%)';
    }
};

// 侧边栏控制
function toggleSideNav() {
    const sideNav = document.querySelector('.side-nav');
    const overlay = document.querySelector('.side-nav-overlay');
    
    if (sideNav.classList.contains('open')) {
        closeSideNav();
    } else {
        openSideNav();
    }
}

function openSideNav() {
    const sideNav = document.querySelector('.side-nav');
    const overlay = document.querySelector('.side-nav-overlay');
    
    sideNav.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden'; // 防止背景滚动
    
    // 确保视频页面侧边栏显示正常
    const videoPlayerContainer = document.querySelector('.video-player-container');
    if (videoPlayerContainer) {
        videoPlayerContainer.style.zIndex = '1000'; // 低于侧边栏
    }
}

function closeSideNav() {
    const sideNav = document.querySelector('.side-nav');
    const overlay = document.querySelector('.side-nav-overlay');
    
    sideNav.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = ''; // 恢复背景滚动
}

// 展开/折叠子菜单
function toggleSubmenu(element) {
    // 关闭其他已展开的子菜单
    const allParents = document.querySelectorAll('.menu-parent');
    allParents.forEach(parent => {
        if (parent !== element && parent.classList.contains('expanded')) {
            parent.classList.remove('expanded');
        }
    });
    
    // 切换当前子菜单
    element.classList.toggle('expanded');
}

// 登录注册弹窗
function showLoginModal() {
    // 先关闭侧边栏，避免覆盖弹窗
    closeSideNav();
    
    // 等待侧边栏关闭过渡动画完成后再显示登录窗口
    setTimeout(() => {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.style.display = 'flex';
            switchTab('login');
        }
    }, 400); // 侧边栏关闭动画时间
}

function showRegisterModal() {
    // 先关闭侧边栏，避免覆盖弹窗
    closeSideNav();
    
    // 等待侧边栏关闭过渡动画完成后再显示注册窗口
    setTimeout(() => {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.style.display = 'flex';
            switchTab('register');
        }
    }, 400); // 侧边栏关闭动画时间
}

function switchTab(tab) {
    // 切换标签
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(t => {
        t.classList.remove('active');
        if (t.getAttribute('data-tab') === tab) {
            t.classList.add('active');
        }
    });

    // 显示对应表单
    document.getElementById('loginForm').style.display = tab === 'login' ? 'flex' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? 'flex' : 'none';
}

// 点击页面其他地方关闭模态框
window.addEventListener('click', function(event) {
    const modal = document.getElementById('authModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

// 登录处理
async function handleLogin() {
    const account = document.getElementById('loginAccount').value;
    const password = document.getElementById('loginPassword').value;
    
    // 验证输入
    if (!account || !password) {
        showToast('请输入账号和密码', 'error');
        return;
    }
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ account, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 登录成功
            showToast('登录成功！欢迎回来！', 'success');
            if (document.getElementById('authModal')) {
                document.getElementById('authModal').style.display = 'none';
            }
            
            // 立即更新UI状态，不等待页面刷新
            updateLoginUI(true, account);
            
            // 延迟刷新页面，让用户先看到提示和状态更新
            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            // 登录失败
            showToast(data.message || '登录失败，请检查账号密码', 'error');
        }
    } catch (error) {
        console.error('登录请求出错:', error);
        showToast('登录请求发生错误', 'error');
    }
}

// 注册处理
async function handleRegister() {
    const account = document.getElementById('registerAccount').value;
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    
    // 验证输入
    if (!account || !password) {
        showToast('请输入账号和密码', 'error');
        return;
    }
    
    if (password !== confirm) {
        showToast('两次输入的密码不一致', 'error');
        return;
    }
    
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ account, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 注册成功，自动切换到登录页面
            showToast('注册成功，请登录', 'success');
            switchTab('login');
            document.getElementById('loginAccount').value = account;
            document.getElementById('loginPassword').value = password;
        } else {
            // 注册失败
            showToast(data.message || '注册失败', 'error');
        }
    } catch (error) {
        console.error('注册请求出错:', error);
        showToast('注册请求发生错误', 'error');
    }
}

// 退出登录
async function handleLogout() {
    try {
        const response = await fetch('/logout');
        const data = await response.json();
        
        if (data.success) {
            // 立即更新UI状态，不等待页面刷新
            updateLoginUI(false);
            
            // 显示提示
            showToast('退出成功，期待你的归来！', 'success');
            
            // 延迟刷新页面
            setTimeout(() => {
                location.reload();
            }, 1000);
        }
    } catch (error) {
        console.error('退出登录请求出错:', error);
        showToast('退出请求失败，请重试', 'error');
    }
}

// 更新UI显示登录状态
function updateLoginUI(isLoggedIn, account) {
    // 处理侧边栏的用户信息
    const sidebarUserInfo = document.querySelector('.user-info-sidebar');
    const sidebarLoginButtons = document.querySelector('.login-buttons');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarLogoutBtn = document.querySelector('.sidebar-logout-btn');
    const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
    
    if (isLoggedIn && account) {
        // 已登录状态
        if (sidebarUserInfo) sidebarUserInfo.style.display = 'flex';
        if (sidebarLoginButtons) sidebarLoginButtons.style.display = 'none';
        if (sidebarUserName) sidebarUserName.textContent = account;
        if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = 'block';
        
        // 如果有用户头像，使用首字母或默认图像
        if (sidebarUserAvatar) {
            const img = sidebarUserAvatar.querySelector('img');
            if (img) {
                // 这里可以根据实际情况设置用户头像
                // 如果没有自定义头像，可以继续使用logo作为默认头像
            }
        }
    } else {
        // 未登录状态
        if (sidebarUserInfo) sidebarUserInfo.style.display = 'none';
        if (sidebarLoginButtons) sidebarLoginButtons.style.display = 'flex';
        if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = 'none';
        if (sidebarUserName) sidebarUserName.textContent = '未登录';
    }
    
    // 兼容处理首页中可能存在的用户信息元素
    const indexUserInfo = document.querySelector('.user-info');
    const indexLoginBtn = document.querySelector('.login');
    const indexSigninBtn = document.querySelector('.signin');
    
    if (indexUserInfo && indexLoginBtn && indexSigninBtn) {
        if (isLoggedIn) {
            indexUserInfo.style.display = 'flex';
            indexLoginBtn.style.display = 'none';
            indexSigninBtn.style.display = 'none';
            
            // 如果首页有用户名显示，更新它
            const userAccountElem = indexUserInfo.querySelector('.user-account');
            if (userAccountElem) {
                userAccountElem.textContent = account;
            }
        } else {
            indexUserInfo.style.display = 'none';
            indexLoginBtn.style.display = 'inline-block';
            indexSigninBtn.style.display = 'inline-block';
        }
    }
}

// 显示自定义消息提示
function showToast(message, type = 'success') {
    // 检查是否已存在提示容器
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        // 创建提示容器
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // 创建新的提示消息
    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    
    // 添加到容器
    toastContainer.appendChild(toast);
    
    // 渐入效果
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 3秒后自动移除
    setTimeout(() => {
        toast.classList.add('hide');
        
        // 动画结束后移除元素
        setTimeout(() => {
            toast.remove();
            
            // 如果容器为空则移除容器
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        }, 300);
    }, 3000);
}

// 页面加载完成后检查登录状态
document.addEventListener('DOMContentLoaded', async function() {
    // 初始化全局主题（主题已通过内联脚本设置）
    GlobalTheme.init();
    
    try {
        // 获取登录状态
        const response = await fetch('/check_login');
        const data = await response.json();
//        alert('登录状态：'+data.loggedIn+" 登录账号："+data.account);


        
        if (data.account && data.loggedIn) {
            // 用户已登录，更新UI
//            alert("已登录，开始修改UI");
            updateLoginUI(true, data.account);
        } else {
            // 用户未登录，更新UI
//            alert("未登录");
            updateLoginUI(false);
        }
    } catch (error) {
        console.error('获取登录状态时出错:', error);
        updateLoginUI(false);
    }
    
    // 添加侧边栏切换事件
    const navToggle = document.querySelector('.nav-toggle');
    if (navToggle) {
        navToggle.addEventListener('click', toggleSideNav);
    }
    
    // 添加侧边栏关闭事件
    const sideNavClose = document.querySelector('.side-nav-close');
    if (sideNavClose) {
        sideNavClose.addEventListener('click', closeSideNav);
    }
    
    // 添加遮罩层点击关闭事件
    const overlay = document.querySelector('.side-nav-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeSideNav);
    }
    
    // 添加子菜单展开/折叠事件
    const menuParents = document.querySelectorAll('.menu-parent');
    menuParents.forEach(parent => {
        parent.addEventListener('click', function() {
            toggleSubmenu(this);
        });
    });
    
    // z-index层级已在CSS中统一设置，确保侧边栏始终为最高优先级
}); 