/* tabs.js — улучшенная логика переключения вкладок
   - гарантирует, что каждая вкладка раскрывается на весь доступный экран
   - плавные переходы, сброс прокрутки, обновление быстрых данных (wallet)
   - авто-подстройка видимости подписей вкладок на узких экранах
*/

(function () {
  // Устанавливает активный элемент вкладки (визуально)
  function setActiveTabElement(el) {
    document.querySelectorAll("#bottomTabs .tab").forEach(t => t.classList.remove("active"));
    if (!el) return;
    const tab = el.closest ? el.closest('.tab') : el;
    if (tab) tab.classList.add("active");
  }

  // Открывает вкладку по имени: 'farm', 'market', 'auction', 'ref', 'wallet'
  window.openTab = function (tabName, ev) {
    // Скрываем все экраны
    document.querySelectorAll(".screen").forEach(s => {
      s.classList.remove("active");
      // keep display:block handled by CSS; we rely on .active to show
    });

    // Показываем нужный экран
    const screen = document.getElementById("screen_" + tabName);
    if (screen) {
      // Сбрасываем внутреннюю прокрутку и делаем активным
      screen.scrollTop = 0;
      // ensure content fits: set min-height to available area
      const mainArea = document.querySelector('.main-area');
      if (mainArea) {
        const rect = mainArea.getBoundingClientRect();
        // set screen inner minHeight to mainArea height minus padding
        screen.style.minHeight = Math.max(0, rect.height - 8) + "px";
      }
      // activate with animation frame for smooth transition
      requestAnimationFrame(() => screen.classList.add("active"));
    }

    // Визуальная подсветка вкладки
    setActiveTabElement(ev?.currentTarget || ev?.target);

    // Обновление быстрых данных при открытии кошелька
    if (tabName === "wallet") {
      const wt = document.getElementById("walletTon");
      const we = document.getElementById("walletEggs");
      const wc = document.getElementById("walletChickens");
      if (wt) wt.innerText = (typeof window.ton === "number") ? window.ton.toFixed(2) : "0.00";
      if (we) we.innerText = window.eggs || 0;
      if (wc) wc.innerText = window.chickens || 0;
    }
  };

  // Авто-скрытие подписей вкладок на очень узких экранах
  function adjustTabLabels() {
    const small = window.innerWidth <= 360;
    document.querySelectorAll("#bottomTabs .tab .label").forEach(l => {
      l.style.display = small ? "none" : "";
    });
  }

  // Поднимаем bottomTabs если виртуальная панель навигации перекрывает контент (Android)
  function adjustBottomTabsForViewport() {
    const bottomTabs = document.getElementById('bottomTabs');
    if (!bottomTabs) return;
    // Используем visualViewport если доступно
    if (window.visualViewport) {
      const vh = window.visualViewport.height;
      const wh = window.innerHeight;
      const diff = wh - vh;
      // если есть разница (виртуальная панель), поднимаем bottomTabs на diff px
      bottomTabs.style.bottom = (10 + Math.max(0, diff)) + 'px';
    } else {
      bottomTabs.style.bottom = '10px';
    }
  }

  // Инициализация: назначаем обработчики и выставляем начальную вкладку
  function initTabs() {
    document.querySelectorAll("#bottomTabs .tab").forEach(tab => {
      tab.addEventListener('click', (ev) => {
        const idx = Array.from(tab.parentElement.children).indexOf(tab);
        const mapping = ['farm','market','auction','ref','wallet'];
        const name = mapping[idx] || tab.dataset.target || 'farm';
        window.openTab(name, ev);
      });
    });

    window.addEventListener('resize', () => {
      adjustTabLabels();
      adjustBottomTabsForViewport();
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => { adjustTabLabels(); adjustBottomTabsForViewport(); }, 300);
    });

    // initial adjustments
    adjustTabLabels();
    adjustBottomTabsForViewport();

    // open default tab (farm) if none active
    const active = document.querySelector("#bottomTabs .tab.active");
    if (active) {
      active.click();
    } else {
      const first = document.querySelector("#bottomTabs .tab");
      if (first) first.click();
    }
  }

  // Run init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTabs);
  } else {
    initTabs();
  }

  // Export helper for manual calls
  window.adjustTabLabels = adjustTabLabels;
  window.adjustBottomTabsForViewport = adjustBottomTabsForViewport;
})();