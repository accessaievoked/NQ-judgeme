(function () {
  var STYLE_ID = "jm-reviews-style";

  // The server already rendered the merchant's custom (or default) template
  // into final HTML — see app/routes/apps.reviews.jsx and
  // app/reviewWidget/render.server.ts. This script injects it and wires up
  // the {{rateWidget}} inline "click a star, submit, no page nav" control.
  function injectCss(css) {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function wireRateWidget(container, productId) {
    var rate = container.querySelector("[data-jm-rate]");
    if (!rate) return;

    var stars = rate.querySelectorAll(".jm-rate__star");
    var form = rate.querySelector("[data-jm-rate-form]");
    var valueInput = rate.querySelector("[data-jm-rate-value]");
    var thanks = rate.querySelector("[data-jm-rate-thanks]");

    stars.forEach(function (star) {
      star.addEventListener("click", function () {
        var value = Number(star.getAttribute("data-value"));
        valueInput.value = value;
        stars.forEach(function (s) {
          s.classList.toggle("is-selected", Number(s.getAttribute("data-value")) <= value);
        });
        form.hidden = false;
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      fetch("/apps/reviews?productId=" + encodeURIComponent(productId), {
        method: "POST",
        body: new FormData(form),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || "Submit failed");
          form.hidden = true;
          thanks.hidden = false;
          loadReviews(container, productId);
        })
        .catch(function (error) {
          console.error("Error submitting review", error);
        });
    });
  }

  function loadReviews(container, productId) {
    fetch("/apps/reviews?productId=" + encodeURIComponent(productId))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        injectCss(data.css || "");
        container.innerHTML = data.html || "";
        wireRateWidget(container, productId);
      })
      .catch(function (error) {
        console.error("Error fetching reviews", error);
        container.innerHTML = '<p class="jm-reviews__empty">Reviews unavailable.</p>';
      });
  }

  document.querySelectorAll("[data-jm-reviews]").forEach(function (container) {
    var productId = container.getAttribute("data-product-id");
    loadReviews(container, productId);
  });
})();
