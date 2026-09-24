(function () {
  // The full, paginated reviews list embedded directly on a themed page —
  // fetches the same fragment apps.reviews.all.jsx serves to a direct link
  // navigation, but with pagination/search intercepted here (event
  // delegation on the container, so it survives each innerHTML replace with
  // no re-wiring needed) and re-fetched instead of leaving the page. A
  // no-JS visitor still gets working (if theme-less) pagination/search,
  // since the fragment's own links/form point at real, working URLs — see
  // apps.reviews.all.jsx's header comment.
  function buildUrl(productId, params) {
    var url = new URL("/apps/reviews/all", window.location.origin);
    url.searchParams.set("productId", productId);
    url.searchParams.set("fragment", "1");
    url.searchParams.set("page", params.page || "1");
    if (params.q) url.searchParams.set("q", params.q);
    return url.pathname + "?" + url.searchParams.toString();
  }

  function paramsFromHref(href) {
    var url = new URL(href, window.location.origin);
    return { page: url.searchParams.get("page") || "1", q: url.searchParams.get("q") || "" };
  }

  function load(container, productId, params) {
    fetch(buildUrl(productId, params))
      .then(function (res) { return res.text(); })
      .then(function (html) {
        container.innerHTML = html;
      })
      .catch(function (error) {
        console.error("Error loading reviews", error);
        container.innerHTML = '<p class="jm-reviews__empty">Reviews unavailable.</p>';
      });
  }

  // Same per-block shrink-to-fit wrapper fix as jm-widget.js/jm-write-review.js
  // — see jm-widget.js's own copy for the full explanation.
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

  document.querySelectorAll("[data-jm-reviews-all]").forEach(function (container) {
    // The block's own `product.id` (set when it sits on the product page
    // template) wins; falls back to ?productId=... in the current URL when
    // that's blank (e.g. the block sits on a generic Page instead — see
    // all-reviews.liquid's comment) so one Page works for every product.
    var productId = container.getAttribute("data-product-id");
    if (!productId) {
      productId = new URL(window.location.href).searchParams.get("productId") || "";
    }
    if (!productId) {
      container.innerHTML = '<p class="jm-reviews__empty">No product specified — link to this page with ?productId=... in the URL.</p>';
      return;
    }
    stretchWrapperAncestors(container);

    container.addEventListener("click", function (e) {
      var link = e.target.closest(".jm-reviews-page__num, .jm-reviews-page__nav");
      if (!link) return;
      e.preventDefault();
      load(container, productId, paramsFromHref(link.getAttribute("href")));
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    container.addEventListener("submit", function (e) {
      if (!e.target.matches("[data-jm-reviews-all-search]")) return;
      e.preventDefault();
      var input = e.target.querySelector('input[name="q"]');
      load(container, productId, { page: "1", q: input ? input.value : "" });
    });

    load(container, productId, { page: "1", q: "" });
  });
})();
