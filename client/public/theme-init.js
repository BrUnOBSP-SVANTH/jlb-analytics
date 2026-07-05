// Aplica o tema salvo ANTES do React montar — elimina o flash de tema errado.
// Externo (não inline) para a CSP poder exigir script-src 'self'.
(function () {
  try {
    var t = localStorage.getItem("jlb-theme") || "dark";
    document.documentElement.classList.add(t === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
