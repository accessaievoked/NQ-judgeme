(function () {
  // The server rendered form fragment (including its own <style> tag — see
  // apps.reviews.write.jsx's `fragment` branch) is fetched and injected
  // here, same split as jm-widget.js: server renders final HTML/CSS, this
  // script just injects it and wires up interactivity — a <script> tag
  // injected via innerHTML never executes, so the wiring below is a
  // necessary near-duplicate of apps.reviews.write.jsx's own WIRE_SCRIPT
  // (used only for that route's *full-page* response, which loads as a
  // normal inline script instead of via innerHTML).
  function wire(container, productId) {
    var form = container.querySelector("[data-jm-write-form]");
    if (!form) return;

    var stars = container.querySelectorAll(".jm-write-review__star");
    var ratingInput = container.querySelector("[data-jm-write-rating]");
    var errorEl = container.querySelector("[data-jm-write-error]");
    var doneEl = container.querySelector("[data-jm-write-done]");

    stars.forEach(function (star) {
      star.addEventListener("click", function () {
        var value = Number(star.getAttribute("data-value"));
        ratingInput.value = value;
        stars.forEach(function (s) {
          s.classList.toggle("is-selected", Number(s.getAttribute("data-value")) <= value);
        });
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!ratingInput.value) {
        if (errorEl) {
          errorEl.textContent = "Please choose a star rating.";
          errorEl.hidden = false;
        }
        return;
      }
      if (errorEl) errorEl.hidden = true;
      var submitBtn = form.querySelector(".jm-write-review__submit");
      if (submitBtn) submitBtn.disabled = true;

      fetch("/apps/reviews/write?productId=" + encodeURIComponent(productId), {
        method: "POST",
        body: new FormData(form),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || "Submit failed");
          form.hidden = true;
          if (doneEl) doneEl.hidden = false;
        })
        .catch(function (error) {
          if (errorEl) {
            errorEl.textContent = error.message || "Something went wrong — please try again.";
            errorEl.hidden = false;
          }
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  function load(container, productId) {
    fetch("/apps/reviews/write?productId=" + encodeURIComponent(productId) + "&fragment=1")
      .then(function (res) { return res.text(); })
      .then(function (html) {
        container.innerHTML = html;
        wire(container, productId);
      })
      .catch(function (error) {
        console.error("Error loading review form", error);
        container.innerHTML = '<p class="jm-reviews__empty">Review form unavailable.</p>';
      });
  }

  // Same per-block shrink-to-fit wrapper fix as jm-widget.js — see that
  // file's own copy for the full explanation of why this is needed at all.
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

  document.querySelectorAll("[data-jm-write-review]").forEach(function (container) {
    var productId = container.getAttribute("data-product-id");
    stretchWrapperAncestors(container);
    load(container, productId);
  });
})();
