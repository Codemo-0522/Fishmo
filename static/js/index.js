
//消息弹窗方法
function showToast(message, type = 'info', duration = 2000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');

    // 先移除所有旧提示
    container.querySelectorAll('.toast-message').forEach(t => t.remove());

    toast.className = `toast-message ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // 自动消失逻辑（使用传入的duration参数）
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 500); // 匹配过渡动画时间
    }, duration);
}

// 实现导航栏交互
document.querySelectorAll('.nav-parent-header').forEach(header => {
    header.addEventListener('click', () => {
        const parent = header.parentElement;
        parent.classList.toggle('active');

        // 关闭其他展开的父级菜单
        document.querySelectorAll('.nav-parent').forEach(p => {
            if(p !== parent) p.classList.remove('active');
        });
    });
});

// 新增侧边栏展开关闭点击事件
document.querySelector('.left-bar').addEventListener('click', function() {
    const leftNavbar = document.querySelector('.left-navbar-div');
    leftNavbar.classList.toggle('hidden');

    // 关闭所有展开的导航菜单
    document.querySelectorAll('.nav-parent').forEach(parent => {
        parent.classList.remove('active');
    });
});

//=====================================
// 显示登录/注册弹窗
function showAuthModal(type) {
    const modal = document.getElementById('authModal');
    modal.style.display = 'flex';
    switchTab(type);
    if (type === 'register') generateAccount();
}

// 切换选项卡
function switchTab(type) {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === type);
    });
    document.getElementById('loginForm').style.display = type === 'login' ? 'block' : 'none';
    document.getElementById('registerForm').style.display = type === 'register' ? 'block' : 'none';
}

// 关闭弹窗
document.getElementById('authModal').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
});

// 绑定按钮事件
document.querySelector('.login').addEventListener('click', () => showAuthModal('login'));
document.querySelector('.signin').addEventListener('click', () => showAuthModal('register'));

// 注册处理
async function handleRegister() {
    const account = document.getElementById('registerAccount').value;
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;

    if (password !== confirm) return showToast('两次本命密钥输入不一致', 'info');

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account, password })
        });
        const data = await response.json();

        if (data.success) {
            await handleLogin(account, password); // 自动登录
            document.getElementById('authModal').style.display = 'none';
            showToast('灵契缔结成功，已自动归位', 'success',2500)
        } else {
            showToast(data.message || '灵契缔约失败', 'error',2500)
        }
    } catch (error) {
        showToast('请求失败', 'error',2500)
    }
}

// 登录处理
// 登录处理（支持参数传入）
async function handleLogin(account, password) {
    // 如果未传入参数，从输入框获取
    if (typeof account === 'undefined' || typeof password === 'undefined') {
        account = document.getElementById('loginAccount').value;
        password = document.getElementById('loginPassword').value;
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account, password })
        });
        const data = await response.json();

        if (data.success) {
            showToast('元神归位成功，请开始你的修仙之旅吧！', 'success',2500)
            // 更新UI
            document.querySelector('.login').style.display = 'none';
            document.querySelector('.signin').style.display = 'none';
            document.querySelector('.user-info').style.display = 'flex';
            document.getElementById('authModal').style.display = 'none';
            // 刷新页面保持状态
            checkLoginStatus();
        } else {
            showToast(data.message || '元神归位失败',"error",2500)
        }
    } catch (error) {
        showToast('请求失败',"error",2500)
    }
}

// 退出处理
async function handleLogout() {
    try {
        const response = await fetch('/logout');
        if (response.ok) {
            showToast('开始闭关，元神离体',"info",2500)
            location.reload(); // 刷新页面

        }
    } catch (error) {
        showToast('闭关失败',"error",2500)
    }
}

// 检查登录状态
async function checkLoginStatus() {
    try {
        const response = await fetch('/check_login');
        const data = await response.json();
        if (data.loggedIn) {
            document.querySelector('.login').style.display = 'none';
            document.querySelector('.signin').style.display = 'none';
            document.querySelector('.user-info').style.display = 'flex';
            document.querySelector('.user-account').textContent = data.account;
        }
    } catch (error) {
        console.error('检查登录状态失败');
    }
}

// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', checkLoginStatus);


//逐字显示文本
const targetText = "佛前求来相思铃，山阶千级步步行。一响一叩首，一想一垂眸。梵唱幽幽渡忘川，明灯灼灼映莲台。三千道藏皆殊途，众生各有归处。缘起如雾聚还散，因果似月盈复缺。";
const textElement = document.getElementById('text');
const cursor = document.querySelector('.cursor');

// 清空初始内容
textElement.innerHTML = '';

// 拆分字符并创建span元素
const characters = targetText.split('').map(char => {
  const span = document.createElement('span');
  span.textContent = char;
  return span;
});

// 依次显示字符
characters.forEach((char, index) => {
  setTimeout(() => {
    textElement.appendChild(char);
    // 最后一个字符显示后停止光标闪烁
    if(index === characters.length - 1) {
      cursor.style.animation = 'none';
      cursor.style.opacity = 0;
    }
  }, index * 200); // 每个字符间隔200ms
});

