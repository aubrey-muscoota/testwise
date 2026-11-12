// Beta sign-up: checks the fields on submit, posts JSON to /api/beta and swaps
// the form for a thank-you. Without JavaScript the form posts normally and the
// Worker redirects back to /beta/?joined=1.
const form = document.getElementById("signup");
const done = document.getElementById("done");
const button = form.querySelector("button[type=submit]");
const email = form.elements.email;
const ageOk = form.elements.age_ok;

const show = (id, text) => {
  const el = document.getElementById(id);
  el.textContent = text ?? "";
  el.hidden = !text;
};

function finish(address) {
  document.getElementById("done-email").textContent = address || "you";
  form.hidden = true;
  done.hidden = false;
  done.focus();
}

if (new URLSearchParams(location.search).has("joined")) finish("");

email.addEventListener("input", () => {
  if (email.getAttribute("aria-invalid") === "true" && email.validity.valid) {
    email.removeAttribute("aria-invalid");
    show("email-err");
  }
});
ageOk.addEventListener("change", () => ageOk.checked && show("age-err"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  show("form-err");
  const value = email.value.trim();
  let ok = true;
  if (!value || !email.validity.valid) {
    email.setAttribute("aria-invalid", "true");
    show("email-err", value ? "That doesn't look like an email address" : "Enter your email");
    ok = false;
  }
  if (!ageOk.checked) {
    show("age-err", "The beta is for students 13 and older");
    ok = false;
  }
  if (!ok) return (value && email.validity.valid ? ageOk : email).focus();

  button.disabled = true;
  button.textContent = "Joining…";
  try {
    const res = await fetch("/api/beta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: value,
        test_month: form.elements.test_month.value,
        age_ok: true,
        website: form.elements.website.value,
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    finish(value);
  } catch {
    show("form-err", "That didn't go through. Check your connection and try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Join the beta";
  }
});
