document.getElementById('mathProblemsBtn').addEventListener('click', function() {
    showModal('Math Problem Solving');
});

document.getElementById('multipleChoiceBtn').addEventListener('click', function() {
    showModal('Multiple Choice Exam');
});

function showModal(examType) {
    var modal = document.getElementById('examOptionsModal');
    modal.style.display = 'block';
    document.getElementById('modalTitle').textContent = 'Select ' + examType;

    // Update the links based on exam type if needed
}

// Get the <span> element that closes the modal
var span = document.getElementsByClassName('close')[0];

// When the user clicks on <span> (x), close the modal
span.onclick = function() {
    var modal = document.getElementById('examOptionsModal');
    modal.style.display = "none";
}

// Click anywhere outside of the modal to close it
window.onclick = function(event) {
    var modal = document.getElementById('examOptionsModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}
