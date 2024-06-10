function showOptions(topicId, topicName) {
    const modal = document.getElementById('topicModal');
    document.getElementById('modalTitle').innerText = topicName;
    modal.style.display = 'block';

    document.getElementById('reviewLink').onclick = (event) => showReviewOptions(event, topicId);
    document.getElementById('examLink').onclick = (event) => showExamOptions(event, topicId);
}

function showReviewOptions(event, topicId) {
    event.preventDefault();
    document.getElementById('initialOptions').style.display = 'none';
    document.getElementById('reviewOptions').style.display = 'block';
}

function showExamOptions(event, topicId) {
    event.preventDefault();
    document.getElementById('initialOptions').style.display = 'none';
    document.getElementById('examOptions').style.display = 'block';

    document.getElementById('multipleChoiceWeb').onclick = (event) => takeMultiplechoice(event, topicId);
    document.getElementById('computationalWeb').onclick = (event) => takeComputational(event, topicId);
    document.getElementById('multipleChoiceEmail').onclick = (event) => sendMultiplechoice(event, topicId);
    document.getElementById('computationalEmail').onclick = (event) => sendComputationalExamEmail(event, topicId);
}

function takeMultiplechoice(event, topicId) {
    event.preventDefault();
    window.location.href = `/take-exam/${topicId}`;
}

function takeComputational(event, topicId) {
    event.preventDefault();
    // Add your logic for taking computational exams
}

function sendMultiplechoice(event, topicId) {
    event.preventDefault();
    // Add your logic for sending multiple choice exams via email
}

function sendComputationalExamEmail(event, topicId) {
    event.preventDefault();
    // Add your logic for sending computational exams via email
}

document.querySelector('.close').onclick = function() {
    document.getElementById('topicModal').style.display = 'none';
};
