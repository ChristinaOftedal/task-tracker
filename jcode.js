// ===================================================
// 1. GRAB THE ELEMENTS WE NEED FROM THE HTML
// ===================================================
var taskForm = document.getElementById("task-form");
var titleInput = document.getElementById("task-title");
var priorityInput = document.getElementById("task-priority");
var categoryInput = document.getElementById("task-category");
var dueInput = document.getElementById("task-due");
var reminderInput = document.getElementById("task-reminder");
var taskList = document.getElementById("task-list");
var searchBar = document.getElementById("search-bar");
var emptyMessage = document.getElementById("empty-message");
var reminderBanner = document.getElementById("reminder-banner");
var reminderText = document.getElementById("reminder-text");
var dismissButton = document.getElementById("dismiss-reminder");

// Readable names for the dropdown values (the values have dashes, these look nicer)
var priorityNames = {
    "chill": "Chill",
    "dont-worry": "Don't Worry",
    "start-worrying": "Start Worrying",
    "lock-in": "Lock In"
};

var categoryNames = {
    "school": "School",
    "work": "Work",
    "personal": "Personal"
};


// ===================================================
// 2. SAVING AND LOADING (localStorage)
// localStorage keeps data in the browser even after the
// tab is closed. It can only store text, so we use
// JSON.stringify to turn our array into text, and
// JSON.parse to turn it back into an array.
// ===================================================
function loadTasks() {
    var saved = localStorage.getItem("tasks");
    if (saved === null) {
        return []; // nothing saved yet, start with an empty list
    }
    return JSON.parse(saved);
}

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

// Our main list of tasks. Each task is an object like:
// { id, title, priority, category, dueDate, reminder, reminded }
var tasks = loadTasks();


// ===================================================
// 3. ADD A TASK
// ===================================================
taskForm.addEventListener("submit", function (event) {
    event.preventDefault(); // stops the form from reloading the page

    var newTask = {
        id: Date.now(),                    // current time in ms = a unique id
        title: titleInput.value.trim(),
        priority: priorityInput.value,
        category: categoryInput.value,
        dueDate: dueInput.value,           // format: "2026-11-20"
        reminder: reminderInput.value,     // format: "2026-11-20T09:00" or "" if blank
        reminded: false                    // becomes true once the reminder has gone off
    };

    tasks.push(newTask);
    saveTasks();
    displayTasks();

    taskForm.reset(); // clear the form for the next task

    // Ask permission for pop-up notifications the first time a reminder is set
    if (newTask.reminder !== "") {
        askNotificationPermission();
    }
});


// ===================================================
// 4. DELETE A TASK
// ===================================================
function deleteTask(id) {
    // Keep every task EXCEPT the one with this id
    tasks = tasks.filter(function (task) {
        return task.id !== id;
    });
    saveTasks();
    displayTasks();
}


// ===================================================
// 5. SHOW THE TASKS ON THE PAGE
// ===================================================
function displayTasks() {
    taskList.innerHTML = ""; // clear the list, then rebuild it

    // Search: only show tasks whose title includes what was typed
    var searchText = searchBar.value.toLowerCase();
    var matchingTasks = tasks.filter(function (task) {
        return task.title.toLowerCase().includes(searchText);
    });

    // Sort so the task due soonest is at the top
    matchingTasks.sort(function (a, b) {
        return a.dueDate.localeCompare(b.dueDate);
    });

    // Show the "no tasks" message if the list is empty
    if (matchingTasks.length === 0) {
        emptyMessage.classList.remove("hidden");
        if (tasks.length === 0) {
            emptyMessage.textContent = "No tasks yet. Add one above!";
        } else {
            emptyMessage.textContent = "No tasks match your search.";
        }
    } else {
        emptyMessage.classList.add("hidden");
    }

    // Build an <li> for each task
    matchingTasks.forEach(function (task) {
        var li = document.createElement("li");
        li.className = "task " + task.priority; // priority class sets the border color

        // Left side: title + details
        var info = document.createElement("div");

        var title = document.createElement("p");
        title.className = "task-title";
        title.textContent = task.title; // textContent is safe (won't run any HTML typed in)

        var details = document.createElement("p");
        details.className = "task-details";

        var priorityTag = document.createElement("span");
        priorityTag.className = "tag " + task.priority;
        priorityTag.textContent = priorityNames[task.priority];

        var categoryTag = document.createElement("span");
        categoryTag.className = "tag category";
        categoryTag.textContent = categoryNames[task.category];

        var dueText = document.createElement("span");
        dueText.textContent = "Due: " + formatDate(task.dueDate);
        if (isOverdue(task.dueDate)) {
            dueText.textContent += " (Overdue!)";
            dueText.className = "overdue";
        }

        details.appendChild(priorityTag);
        details.appendChild(categoryTag);
        details.appendChild(dueText);

        // Show the reminder time if the task has one
        if (task.reminder !== "") {
            var reminderSpan = document.createElement("span");
            reminderSpan.textContent = " | Reminder: " + formatDateTime(task.reminder);
            details.appendChild(reminderSpan);
        }

        info.appendChild(title);
        info.appendChild(details);

        // Right side: delete button
        var deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", function () {
            deleteTask(task.id);
        });

        li.appendChild(info);
        li.appendChild(deleteButton);
        taskList.appendChild(li);
    });
}

// Re-display the list every time the user types in the search bar
searchBar.addEventListener("input", displayTasks);


// ===================================================
// 6. DATE HELPERS
// ===================================================

// "2026-11-20" -> "Nov 20, 2026"
function formatDate(dateString) {
    // Adding T00:00 makes the browser read it as local time (not UTC),
    // otherwise the date can show up one day early
    var date = new Date(dateString + "T00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "2026-11-20T09:00" -> "Nov 20, 9:00 AM"
function formatDateTime(dateTimeString) {
    var date = new Date(dateTimeString);
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// True if the due date was before today
function isOverdue(dateString) {
    var today = new Date();
    today.setHours(0, 0, 0, 0); // start of today
    var due = new Date(dateString + "T00:00");
    return due < today;
}


// ===================================================
// 7. REMINDERS
// Every 30 seconds we check each task. If its reminder
// time has passed and it hasn't reminded yet, we show
// the yellow banner (and a desktop notification if the
// user allowed them).
// Note: reminders only go off while the page is open.
// If the page was closed, they show the next time you open it.
// ===================================================
function checkReminders() {
    var now = new Date();

    tasks.forEach(function (task) {
        if (task.reminder !== "" && task.reminded === false) {
            var reminderTime = new Date(task.reminder);

            if (reminderTime <= now) {
                showReminder(task);
                task.reminded = true; // so it only reminds once
                saveTasks();
            }
        }
    });
}

function showReminder(task) {
    var message = "Reminder: \"" + task.title + "\" is due " + formatDate(task.dueDate);

    // On-page banner
    reminderText.textContent = message;
    reminderBanner.classList.remove("hidden");

    // Desktop notification (only works if the user clicked "Allow")
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Task Tracker", { body: message });
    }
}

function askNotificationPermission() {
    // Only ask if the browser supports it and the user hasn't answered yet
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

dismissButton.addEventListener("click", function () {
    reminderBanner.classList.add("hidden");
});


// ===================================================
// 8. START THE APP
// ===================================================
displayTasks();                      // show saved tasks when the page loads
checkReminders();                    // catch any reminders missed while the page was closed
setInterval(checkReminders, 30000);  // then check again every 30 seconds