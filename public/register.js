document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById('register-form'); // Ensure this matches your form's ID
  
  form.addEventListener('submit', function(event) {
    event.preventDefault();
    
    // FormData will capture all inputs from the form automatically
    const formData = new FormData(form);

    // The fetch API sends the form data via AJAX
    fetch('/register', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json()) // Parse the JSON response from the server
    .then(data => {
      if(data.success) {
        // Show a success message however you prefer, e.g., alert or a div in your form
        alert(data.success);
        // Redirect the user to the login page
        window.location.href = '/login';
      } else if(data.errors) {
        // Handle validation errors returned from the server
        alert('Errors: ' + data.errors.map(error => error.msg).join(', '));
      }
    })
    .catch(error => {
      // Handle network errors or issues with the request
      alert('Registration failed');
      console.error('Error:', error);
    });
  });
});

document.addEventListener('DOMContentLoaded', function() {
  var alerts = document.querySelectorAll('.alert');
  alerts.forEach(function(alert) {
      setTimeout(function() {
          alert.style.display = 'none';
      }, 2000);
  });
});