// The website's only script: the footer year, and the Deutsch/English pills of the bilingual legal pages.
(function () {
  var y = document.getElementById('y');
  if (y) y.textContent = String(new Date().getFullYear());
  var pills = document.querySelectorAll('.lang a');
  if (pills.length === 2) {
    var sync = function () {
      var en = location.hash === '#en';
      pills[0].classList.toggle('on', !en);
      pills[1].classList.toggle('on', en);
    };
    addEventListener('hashchange', sync);
    sync();
  }
})();
