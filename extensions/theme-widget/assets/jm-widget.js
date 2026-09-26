(function () {
  var STYLE_ID = "jm-reviews-style";

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

    if (!form || !valueInput) return;

    stars.forEach(function (star) {
      star.addEventListener("click", function () {
        var value = Number(star.getAttribute("data-value"));

        valueInput.value = value;

        stars.forEach(function (s) {
          s.classList.toggle(
            "is-selected",
            Number(s.getAttribute("data-value")) <= value
          );
        });

        form.hidden = false;
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      fetch(
        "/apps/reviews?productId=" + encodeURIComponent(productId),
        {
          method: "POST",
          body: new FormData(form),
        }
      )
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          if (!data.ok) {
            throw new Error(data.error || "Submit failed");
          }

          form.hidden = true;

          if (thanks) {
            thanks.hidden = false;
          }

          loadReviews(container, productId);
        })
        .catch(function (error) {
          console.error("Error submitting review", error);
        });
    });
  }

  function getReviewRequestSettings(container) {
    var limit = Number(
      container.getAttribute("data-review-limit")
    );

    var skip = Number(
      container.getAttribute("data-review-skip")
    );

    if (!Number.isInteger(limit) || limit < 1) {
      limit = 5;
    }

    if (!Number.isInteger(skip) || skip < 0) {
      skip = 0;
    }

    console.log(limit, skip)

    return {
      limit: limit,
      skip: skip,
    };
  }

  function setupSeeAllReviewsLink(container, moreUrl) {
    var showSeeAll =
      container.getAttribute("data-show-see-all") !== "false";

    var seeAllText =
      container.getAttribute("data-see-all-text") ||
      "See all reviews";

    var seeAllPosition =
      container.getAttribute("data-see-all-position") ||
      "bottom";

    var oldLink = container.querySelector("[data-jm-see-all]");

    if (oldLink) {
      oldLink.remove();
    }

    if (!showSeeAll || !moreUrl) {
      return;
    }

    var link = document.createElement("a");

    link.href = moreUrl;
    link.textContent = seeAllText;
    link.className = "jm-reviews__see-all";
    link.setAttribute("data-jm-see-all", "");

    var list = container.querySelector(
      '[data-jm-block="list"], .jm-reviews__list'
    );

    if (seeAllPosition === "top") {
      if (list && list.parentNode) {
        list.parentNode.insertBefore(link, list);
      } else {
        container.insertBefore(link, container.firstChild);
      }

      return;
    }

    if (list && list.parentNode) {
      list.parentNode.insertBefore(link, list.nextSibling);
    } else {
      container.appendChild(link);
    }
  }

  function loadReviews(container, productId) {
    var settings = getReviewRequestSettings(container);

    var url =
      "/apps/reviews?productId=" +
      encodeURIComponent(productId) +
      "&limit=" +
      encodeURIComponent(settings.limit) +
      "&skip=" +
      encodeURIComponent(settings.skip);

    fetch(url)
      .then(function (res) {
        if (!res.ok) {
          throw new Error(
            "Request failed with status " + res.status
          );
        }

        return res.json();
      })
      .then(function (data) {
        injectCss(data.css || "");

        container.innerHTML = data.html || "";

        setupSeeAllReviewsLink(
          container,
          data.moreUrl || null
        );

        wireRateWidget(container, productId);
      })
      .catch(function (error) {
        console.error(
          "[jm-widget] Error fetching reviews",
          error
        );

        container.innerHTML =
          '<p class="jm-reviews__empty">Reviews unavailable.</p>';
      });
  }

  function stretchWrapperAncestors(el) {
    var node = el.parentElement;
    var hops = 0;

    while (
      node &&
      node.tagName !== "BODY" &&
      hops < 4
    ) {
      if (node.children.length !== 1) {
        break;
      }

      node.style.display = "block";
      node.style.width = "100%";
      node.style.maxWidth = "none";

      node = node.parentElement;
      hops += 1;
    }
  }

  document
    .querySelectorAll("[data-jm-reviews]")
    .forEach(function (container) {
      var productId =
        container.getAttribute("data-product-id");

      if (!productId) {
        return;
      }

      stretchWrapperAncestors(container);

      loadReviews(container, productId);
    });
})();
