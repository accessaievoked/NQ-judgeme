(function () {
  // Read-only badge — no submit form to wire up, unlike jm-widget.js/
  // jm-write-review.js. Same inject-css-then-swap-html pattern as those,
  // fetching from apps.reviews.summary.jsx instead of apps.reviews.jsx.
  var STYLE_ID = "jm-rating-summary-style";

  function injectCss(css) {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  function loadSummary(container, productId) {
    var url = "/apps/reviews/summary?productId=" + encodeURIComponent(productId);
    console.log("[jm-rating-summary] fetching", url, "for productId:", JSON.stringify(productId));
    fetch(url)
      .then(function (res) {
        console.log("[jm-rating-summary] response status", res.status, res.headers.get("content-type"));
        return res.text().then(function (text) {
          if (!res.ok) {
            console.error("[jm-rating-summary] non-OK response body (first 500 chars):", text.slice(0, 500));
            throw new Error("Request failed with status " + res.status);
          }
          try {
            return JSON.parse(text);
          } catch (parseError) {
            console.error("[jm-rating-summary] response wasn't valid JSON (first 500 chars):", text.slice(0, 500));
            throw parseError;
          }
        });
      })
      .then(function (data) {
        console.log("[jm-rating-summary] loaded", data);
        injectCss(data.css || "");
        container.innerHTML = data.html || "";
      })
      .catch(function (error) {
        console.error("[jm-rating-summary] Error fetching rating summary", error);
        container.innerHTML = "";
      });
  }

  document.querySelectorAll("[data-jm-rating-summary-root]").forEach(function (container) {
    var productId = container.getAttribute("data-product-id");
    console.log("[jm-rating-summary] found block, data-product-id =", JSON.stringify(productId));
    if (!productId) {
      console.error("[jm-rating-summary] no data-product-id on this block's container — is `product` in scope where this block was placed? (e.g. not inside a generic Page, or a context without a bound product)");
      container.innerHTML = "";
      return;
    }
    loadSummary(container, productId);
  });
})();
