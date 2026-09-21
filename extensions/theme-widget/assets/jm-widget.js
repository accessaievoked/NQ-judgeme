(function () {
  var STYLE_ID = "jm-reviews-style";

  // The server already rendered the merchant's custom (or default) template
  // into final HTML — see app/routes/apps.reviews.jsx and
  // app/reviewWidget/render.server.ts. This script injects it and wires up
  // the {{rateWidget}} inline "click a star, submit, no page nav" control.
  // Always (re)writes the tag's content instead of only creating it once —
  // the old "if it exists, do nothing" guard meant any css fetched on a
  // later call (e.g. after submitting a review re-triggers loadReviews)
  // could never actually take effect, leaving whatever was injected first
  // stuck even if it was stale or incomplete.
  function injectCss(css) {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = css;
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

  // Shopify wraps every app block (including this one) in its own
  // per-block <div> before it ever reaches our Liquid markup — a wrapper
  // whose width we can't set from product-reviews.liquid because it isn't
  // part of that file's own HTML. Some themes size that wrapper (and
  // whatever it's nested in) to its content ("shrink-to-fit"), which makes
  // the Width/Max width settings on the block pointless: 100% of a box
  // that's only as wide as our own content is still just our content's
  // width. Fix it by walking up and forcing every ancestor that exists
  // purely to hold this one block (i.e. has no sibling elements of its
  // own — never a real multi-block layout container, which might size
  // itself intentionally) to stop shrinking and take the width its own
  // parent actually offers it. Runs before the fetch so there's no layout
  // jump once reviews load.
  function stretchWrapperAncestors(el) {
    var node = el.parentElement;
    var hops = 0;
    while (node && node.tagName !== "BODY" && hops < 4) {
      if (node.children.length !== 1) break;
      node.style.display = "block";
      node.style.width = "100%";
      node.style.maxWidth = "none";
      node = node.parentElement;
      hops += 1;
    }
  }

  document.querySelectorAll("[data-jm-reviews]").forEach(function (container) {
    var productId = container.getAttribute("data-product-id");
    stretchWrapperAncestors(container);
    loadReviews(container, productId);
  });
})();
