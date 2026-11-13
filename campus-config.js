/*
  Odyssey campus settings.

  Fill this in for your institution, or use setup.html to generate it.
  Keep the part after "window.ODYSSEY_CAMPUS =" as valid JSON (double quotes, no trailing commas).
  Set "configured" to true once the details are filled in and checked.

  Fields:
    institution    Name shown on the main screen and in support panels.
    counselling    Your counselling service. name, phone, hours, booking (https link), email.
    urgent         Urgent or after-hours line run by or for your institution.
    health         Campus health centre.
    international  International student support team.
    note           Optional extra line, in English (en) and Chinese (zh).
  Leave any field as "" to hide it.
*/
window.ODYSSEY_CAMPUS = {
  "configured": false,
  "institution": "",
  "counselling": {"name": "", "phone": "", "hours": "", "booking": "", "email": ""},
  "urgent": {"name": "", "phone": "", "hours": "", "booking": "", "email": ""},
  "health": {"name": "", "phone": "", "hours": "", "booking": "", "email": ""},
  "international": {"name": "", "phone": "", "hours": "", "booking": "", "email": ""},
  "note": {"en": "", "zh": ""}
};
