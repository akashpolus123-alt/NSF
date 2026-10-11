const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const nodemailer = require("nodemailer");
const fs = require("fs");
const twilio = require("twilio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nsf_clinic";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to NSF Clinic MongoDB successfully"))
  .catch(err => console.error("MongoDB connection error:", err));

// Twilio Client Setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = accountSid && authToken ? new twilio(accountSid, authToken) : null;

// Clinic ka official WhatsApp number
const CLINIC_WHATSAPP_NUMBER = process.env.CLINIC_WHATSAPP_NUMBER || "+923305934059";

const appointmentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  clinicId: { type: String, default: "professorial-clinic" },
  doctorId: { type: String, default: "doc-shakil" },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  age: String,
  date: { type: String, required: true },
  time: { type: String, required: true },
  type: { type: String, default: "Initial" },
  fee: { type: Number, default: 12000 },
  advancePaid: { type: Number, default: 0 },
  platformCommission: { type: Number, default: 100 },
  clinicShare: { type: Number, default: 0 },
  paymentMethod: { type: String, default: "EasyPaisa/JazzCash" },
  problem: String,
  status: { type: String, default: "Pending" },
  createdAt: { type: Date, default: Date.now }
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

const hrSchema = new mongoose.Schema({
  staffId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  phone: { type: String, required: true },
  salary: { type: Number, default: 0 }
});
const Staff = mongoose.model("Staff", hrSchema);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'akashpolous123@gmail.com',
    pass: process.env.EMAIL_PASS || 'iwufsbgauvcfhwsy'
  }
});

app.post("/api/appointments", async (req, res) => {
  try {
    const { name, phone, age, date, time, problem, type, consultationType, fee, paymentMethod } = req.body;

    if (!name || !phone || !date || !time) {
      return res.status(400).json({ success: false, message: "Tamam zaroori fields bharein!" });
    }

    const existingBooking = await Appointment.findOne({ 
      date: date, 
      time: time, 
      status: { $ne: "Cancelled" } 
    });

    if (existingBooking) {
      return res.status(400).json({ success: false, message: "Yeh time slot pehle se book ho chuki hai!" });
    }

    const finalType = type || consultationType || "Initial";
    const consultFee = fee || (finalType === 'Follow-up' ? 8000 : 12000);
    const advancePaid = consultFee * 0.20;
    const platformCommission = 100;
    const clinicShare = advancePaid - platformCommission;

    // Sequential ID Generation: NSF-00001, NSF-00002, etc.
    const totalCount = await Appointment.countDocuments();
    const nextNum = totalCount + 1;
    const uniqueId = "NSF-" + String(nextNum).padStart(5, '0');

    const newAppointment = new Appointment({
      id: uniqueId,
      clinicId: "professorial-clinic",
      doctorId: "doc-shakil",
      name,
      phone,
      age: age || "",
      date,
      time,
      type: finalType,
      fee: consultFee,
      advancePaid,
      platformCommission,
      clinicShare,
      paymentMethod: paymentMethod || "EasyPaisa/JazzCash",
      problem: problem || "",
      status: "Pending"
    });

    // 1. Save Appointment to Database / Dashboard
    await newAppointment.save();

    // 2. Send WhatsApp & Notifications via Twilio
    if (twilioClient) {
      try {
        const patientMessage = 
`🏥 NSF Pakistan (Prof. Dr. Shakil Jehangir Malik)

Dear ${name},
Your appointment has been successfully booked!

📌 Appointment No: #${uniqueId}
🗓️ Date: ${date}
⏰ Time Slot: ${time}
💳 Payment Method: ${newAppointment.paymentMethod}

Helpline: +92 330 5934059
Thank you for choosing NSF Pakistan!`;

        await twilioClient.messages.create({
          body: patientMessage,
          from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
          to: `whatsapp:${phone}`
        });

        const clinicAlertMessage = 
`🔔 New Appointment Alert - NSF Clinic

A new booking has been received!
📌 Appointment No: #${uniqueId}
👤 Patient Name: ${name}
📞 Phone: ${phone}
🗓️ Date & Time: ${date} at ${time}
💳 Payment Method: ${newAppointment.paymentMethod}
`;

        await twilioClient.messages.create({
          body: clinicAlertMessage,
          from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
          to: `whatsapp:${CLINIC_WHATSAPP_NUMBER}`
        });

        console.log(`WhatsApp notifications sent successfully for ID: ${uniqueId}`);
      } catch (whatsappErr) {
        console.error('WhatsApp message error:', whatsappErr.message);
      }
    }

    res.json({ 
      success: true, 
      message: "Appointment successfully book ho gayi hai aur WhatsApp confirmation bhej di gayi hai!", 
      appointment: newAppointment 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "nsf" && password === "nsf123") {
    res.json({ success: true, clinicId: "professorial-clinic", clinicName: "NSF Clinic" });
  } else {
    res.status(401).json({ success: false, message: 'Ghalat username ya password!' });
  }
});

app.get("/api/clinic-appointments", async (req, res) => {
  try {
    const appointments = await Appointment.find({ clinicId: "professorial-clinic" });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/track", async (req, res) => {
  try {
    const { query } = req.query;
    const appointment = await Appointment.findOne({ $or: [{ id: query }, { phone: query }] }).sort({ createdAt: -1 });
    if (!appointment) return res.status(404).json({ success: false, message: "Koi appointment nahi mili." });
    res.json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/appointments/cancel/:id", async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const updatedAppt = await Appointment.findOneAndUpdate(
        { id: appointmentId }, 
        { status: 'Cancelled' }, 
        { new: true }
    );

    if (!updatedAppt) {
        return res.status(404).json({ success: false, message: 'Appointment nahi mili.' });
    }

    res.json({ success: true, message: 'Appointment kamyaabi se cancel ho chuki hai.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error aaya hai.' });
  }
});

app.delete('/api/appointments/:id', async (req, res) => {
    try {
        const { devPin } = req.body;
        
        if (devPin !== '2527') {
            return res.status(403).json({ success: false, message: 'Access Denied! Sirf developer hi delete kar sakta hai.' });
        }

        const appointmentId = req.params.id;
        const deletedAppt = await Appointment.findOneAndDelete({ id: appointmentId });
        
        if (!deletedAppt) {
            return res.status(404).json({ success: false, message: 'Appointment nahi mili.' });
        }

        res.json({ success: true, message: 'Appointment kamyaabi se delete ho chuki hai.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error aaya hai.' });
    }
});

app.get("/api/finance-summary", async (req, res) => {
  try {
    const appointments = await Appointment.find({ clinicId: "professorial-clinic", status: { $ne: "Cancelled" } });
    let totalConsultationsRevenue = 0, totalAdvanceCollected = 0, totalYourCommission = 0;
    appointments.forEach(app => {
      totalConsultationsRevenue += (app.fee || 0);
      totalAdvanceCollected += (app.advancePaid || 0);
      totalYourCommission += (app.platformCommission || 100);
    });
    res.json({ success: true, totalConsultationsRevenue, totalAdvanceCollected, totalYourCommission, totalBookings: appointments.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/hr-staff", async (req, res) => {
  try {
    let staffList = await Staff.find();
    if (staffList.length === 0) {
      staffList = [
        { staffId: "STF-01", name: "Receptionist Desk", role: "Front Desk", phone: "0330-5934059", salary: 35000 },
        { staffId: "STF-02", name: "Clinic Assistant", role: "Medical Assistant", phone: "0300-1234567", salary: 40000 }
      ];
    }
    res.json(staffList);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/appointments/:id", async (req, res) => {
  try {
    const { status } = req.body;
    await Appointment.findOneAndUpdate({ id: req.params.id }, { status });
    res.json({ success: true, message: "Status update ho gaya hai" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));