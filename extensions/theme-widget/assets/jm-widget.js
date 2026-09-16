(function () {
  function stars(rating) {
    var s = "";
    for (var i = 1; i <= 5; i++) s += i <= Math.round(rating) ? "★" : "☆";
    return s;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render(container, data) {
    if (!data.count) {
      container.innerHTML = '<p class="jm-reviews__empty">No reviews yet.</p>';
      return;
    }

    var html =
      '<div class="jm-reviews__summary">' +
      '<span class="jm-reviews__stars">' + stars(data.average) + "</span>" +
      '<span class="jm-reviews__count">' +
      data.average.toFixed(1) + " (" + data.count + (data.count === 1 ? " review" : " reviews") + ")" +
      "</span></div>";

    data.reviews.forEach(function (r) {
      html +=
        '<div class="jm-reviews__item">' +
        '<div class="jm-reviews__item-stars">' + stars(r.rating) + "</div>" +
        (r.title ? '<div class="jm-reviews__item-title">' + escapeHtml(r.title) + "</div>" : "") +
        (r.body ? '<div class="jm-reviews__item-body">' + escapeHtml(r.body) + "</div>" : "") +
        '<div class="jm-reviews__item-author">' + escapeHtml(r.authorName || "Anonymous") + "</div>" +
        "</div>";
    });

    container.innerHTML = html;
  }

  document.querySelectorAll("[data-jm-reviews]").forEach(function (container) {
    var productId = container.getAttribute("data-product-id");
    fetch("/apps/reviews?productId=" + encodeURIComponent(productId))
      .then(function (res) { return res.json(); })
      .then(function (data) { render(container, data); })
      .catch(function () {
        container.innerHTML = '<p class="jm-reviews__empty">Reviews unavailable.</p>';
      });
  });
})();
