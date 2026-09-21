"use client";

export function SubmitQuizButton() {
  return (
    <button
      type="submit"
      className="btn btn-primary"
      onClick={(e) => {
        if (!window.confirm("Submit this quiz? You won't be able to change any answers after this.")) {
          e.preventDefault();
        }
      }}
    >
      Submit quiz
    </button>
  );
}
