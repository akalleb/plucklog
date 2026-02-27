
if (sessionStorage.getItem("data-layout-mode")
    && sessionStorage.getItem("data-layout-mode") == "light") {
    document.documentElement.setAttribute('data-bs-theme', 'light');
} else if (
    sessionStorage.getItem("data-layout-mode") == "dark") { document.documentElement.setAttribute('data-bs-theme', 'dark'); }