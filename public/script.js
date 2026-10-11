document.addEventListener("DOMContentLoaded", () => {
    const appointmentForm = document.getElementById("appointmentForm");

    if (appointmentForm) {
        appointmentForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const formData = {
                name: document.getElementById("name")?.value || "",
                phone: document.getElementById("phone")?.value || "",
                age: document.getElementById("age")?.value || "",
                date: document.getElementById("date")?.value || "",
                time: document.getElementById("time")?.value || "",
                paymentMethod: document.getElementById("tid")?.value || "EasyPaisa/JazzCash",
                problem: document.getElementById("problem")?.value || ""
            };

            try {
                const response = await fetch("/api/appointments", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (result.success) {
                    alert(`Kamyaabi! Appointment Book Ho Gayi. Appointment No: #${result.appointment.id}`);
                    appointmentForm.reset();
                } else {
                    alert("Error: " + (result.message || "Kuch ghalat ho gaya hai!"));
                }
            } catch (error) {
                console.error("Submission Error:", error);
                alert("Server se connection nahi ho saka. Dobara koshish karein.");
            }
        });
    }
});