import { decodeRpmResponse } from "./decoder.js";

const form = document.getElementById("decode-form");
const input = document.getElementById("response-input");
const result = document.getElementById("result");

function paragraph(className, text) {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

function clearResult() {
  result.replaceChildren();
  result.dataset.state = "idle";
  input.removeAttribute("aria-invalid");
}

function renderSuccess(decoded) {
  result.dataset.state = "success";
  result.replaceChildren(
    paragraph("result-value", decoded.display),
    paragraph("result-detail", `Accepted response: ${decoded.normalized}`)
  );
}

function renderError(failure) {
  result.dataset.state = "error";
  result.replaceChildren(paragraph("result-error", `Error: ${failure.message}`));
  input.setAttribute("aria-invalid", "true");
  input.focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearResult();

  const decoded = decodeRpmResponse(input.value);
  if (decoded.ok) {
    renderSuccess(decoded);
  } else {
    renderError(decoded);
  }
});
