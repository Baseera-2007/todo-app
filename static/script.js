// TaskFlow App Logic

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements Cache
    const themeToggleBtn = document.getElementById('theme-toggle');
    const taskForm = document.getElementById('task-form');
    const taskTitleInput = document.getElementById('task-title-input');
    const taskDueDateInput = document.getElementById('task-due-date');
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const taskList = document.getElementById('task-list');
    const loadingIndicator = document.getElementById('loading-indicator');
    const emptyState = document.getElementById('empty-state');
    const emptyTitle = document.getElementById('empty-title');
    const emptySubtitle = document.getElementById('empty-subtitle');
    const toastContainer = document.getElementById('toast-container');
    
    // Count Badges
    const countAllBadge = document.getElementById('count-all');
    const countActiveBadge = document.getElementById('count-active');
    const countCompletedBadge = document.getElementById('count-completed');

    // Delete Modal Elements
    const deleteModal = document.getElementById('delete-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    const modalTaskPreviewTitle = document.getElementById('modal-task-preview-title');

    // App State
    let tasks = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let taskToDeleteId = null;

    // --- Theme Management ---
    const initTheme = () => {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme) {
            document.documentElement.setAttribute('data-theme', storedTheme);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const defaultTheme = prefersDark ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', defaultTheme);
        }
    };

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        showToast(`Switched to ${newTheme} mode`, 'info');
    });

    // --- Helper Functions ---
    
    // Premium Toast Notifications
    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconClass = 'fa-circle-check';
        if (type === 'error') iconClass = 'fa-circle-xmark';
        if (type === 'info') iconClass = 'fa-circle-info';
        
        toast.innerHTML = `
            <i class="fa-solid ${iconClass} toast-icon"></i>
            <span class="toast-message">${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // Trigger exit animation and remove
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, 3000);
    };

    // Format ISO Date/Date String to readable text (e.g. "Jun 25, 2026")
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        // Split by '-' to avoid timezone shifts when parsing raw strings
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const date = new Date(parts[0], parts[1] - 1, parts[2]);
            return date.toLocaleDateString('en-US', options);
        }
        return new Date(dateString).toLocaleDateString('en-US', options);
    };

    // Evaluate Due Date Status
    const getDueDateStatus = (dueDateString, isCompleted) => {
        if (!dueDateString) return null;
        if (isCompleted) return { label: 'Completed', class: 'completed-due' };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parts = dueDateString.split('-');
        const dueDate = new Date(parts[0], parts[1] - 1, parts[2]);
        dueDate.setHours(0, 0, 0, 0);

        const diffTime = dueDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { label: `Overdue by ${Math.abs(diffDays)}d`, class: 'overdue' };
        } else if (diffDays === 0) {
            return { label: 'Due Today', class: 'today' };
        } else if (diffDays === 1) {
            return { label: 'Due Tomorrow', class: 'upcoming' };
        } else {
            return { label: `Due in ${diffDays} days`, class: 'upcoming' };
        }
    };

    // Update Category Counters
    const updateCounters = () => {
        const total = tasks.length;
        const active = tasks.filter(t => !t.completed).length;
        const completed = tasks.filter(t => t.completed).length;

        countAllBadge.textContent = total;
        countActiveBadge.textContent = active;
        countCompletedBadge.textContent = completed;
    };

    // --- API Operations ---

    // Fetch all tasks from Flask backend
    const fetchTasks = async (showLoading = true) => {
        if (showLoading) {
            loadingIndicator.style.display = 'flex';
            taskList.style.display = 'none';
            emptyState.style.display = 'none';
        }
        
        try {
            const response = await fetch('/tasks');
            if (!response.ok) throw new Error('Failed to fetch tasks from server');
            tasks = await response.json();
            renderTasksList();
        } catch (error) {
            console.error(error);
            showToast('Could not load tasks. Please try again.', 'error');
        } finally {
            if (showLoading) {
                loadingIndicator.style.display = 'none';
                taskList.style.display = 'flex';
            }
        }
    };

    // Create a new task
    const addTask = async (title, dueDate) => {
        try {
            const response = await fetch('/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, due_date: dueDate })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to add task');
            }

            const newTask = await response.json();
            
            // Unshift to place new task at the top
            tasks.unshift(newTask);
            
            // Clean inputs
            taskTitleInput.value = '';
            taskDueDateInput.value = '';
            
            // Rerender list & notify
            renderTasksList();
            showToast('Task added successfully!');
        } catch (error) {
            console.error(error);
            showToast(error.message || 'Error adding task', 'error');
        }
    };

    // Toggle Task completion state
    const toggleTask = async (id, completed) => {
        try {
            const response = await fetch(`/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed })
            });

            if (!response.ok) throw new Error('Failed to update task state');
            
            const updatedTask = await response.json();
            
            // Update local state
            tasks = tasks.map(t => t.id === id ? updatedTask : t);
            
            // Move item based on sorting (active first)
            // Sort local array again
            sortTasks();
            renderTasksList();
            
            showToast(completed ? 'Task marked as completed' : 'Task marked as active');
        } catch (error) {
            console.error(error);
            showToast('Error updating task status', 'error');
            // Revert UI Checkbox
            fetchTasks(false);
        }
    };

    // Update Task Title (Inline Edit)
    const updateTaskTitle = async (id, newTitle) => {
        if (!newTitle.trim()) {
            showToast('Task title cannot be empty', 'error');
            return false;
        }

        try {
            const response = await fetch(`/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });

            if (!response.ok) throw new Error('Failed to save changes');

            const updatedTask = await response.json();
            
            // Update local state
            tasks = tasks.map(t => t.id === id ? updatedTask : t);
            renderTasksList();
            showToast('Task updated successfully');
            return true;
        } catch (error) {
            console.error(error);
            showToast('Error editing task title', 'error');
            return false;
        }
    };

    // Delete Task API
    const deleteTask = async (id) => {
        try {
            const response = await fetch(`/tasks/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete task');

            // Update local state
            tasks = tasks.filter(t => t.id !== id);
            renderTasksList();
            showToast('Task deleted successfully');
        } catch (error) {
            console.error(error);
            showToast('Error deleting task', 'error');
        }
    };

    // Sort tasks in cache (completed at the bottom, newest first)
    const sortTasks = () => {
        tasks.sort((a, b) => {
            if (a.completed === b.completed) {
                // Both completed or both active, order by creation date DESC
                return new Date(b.created_at) - new Date(a.created_at);
            }
            // Active tasks (completed=false) first
            return a.completed ? 1 : -1;
        });
    };

    // --- UI Render ---
    const renderTasksList = () => {
        taskList.innerHTML = '';
        updateCounters();

        // Filter and Search local array
        let filteredTasks = tasks.filter(task => {
            // Apply filter buttons
            if (currentFilter === 'active' && task.completed) return false;
            if (currentFilter === 'completed' && !task.completed) return false;
            
            // Apply search query
            if (searchQuery) {
                return task.title.toLowerCase().includes(searchQuery.toLowerCase());
            }
            
            return true;
        });

        // Toggle Empty state view
        if (filteredTasks.length === 0) {
            taskList.style.display = 'none';
            emptyState.style.display = 'flex';
            
            if (searchQuery) {
                emptyTitle.textContent = "No search results found";
                emptySubtitle.textContent = "Try matching different keywords or clear the search query.";
            } else if (currentFilter === 'active') {
                emptyTitle.textContent = "No active tasks";
                emptySubtitle.textContent = "Hooray! There are no pending items on your schedule.";
            } else if (currentFilter === 'completed') {
                emptyTitle.textContent = "No completed tasks yet";
                emptySubtitle.textContent = "Tasks you complete will show up here. Get to work!";
            } else {
                emptyTitle.textContent = "Your schedule is clear!";
                emptySubtitle.textContent = "Time to add a new task to get started on your goals.";
            }
        } else {
            taskList.style.display = 'flex';
            emptyState.style.display = 'none';

            filteredTasks.forEach(task => {
                const li = document.createElement('li');
                li.className = `task-item ${task.completed ? 'completed-item' : ''}`;
                li.setAttribute('data-id', task.id);

                const dueStatus = getDueDateStatus(task.due_date, task.completed);
                const readableCreated = formatDate(task.created_at ? task.created_at.split(' ')[0] : '');
                
                li.innerHTML = `
                    <div class="checkbox-container">
                        <input type="checkbox" class="custom-checkbox task-checkbox" ${task.completed ? 'checked' : ''} aria-label="Mark task as complete">
                    </div>
                    <div class="task-content">
                        <div class="task-title-wrapper">
                            <span class="task-title">${escapeHTML(task.title)}</span>
                        </div>
                        <div class="task-meta">
                            <span class="meta-item created-date">
                                <i class="fa-regular fa-clock"></i> Created ${readableCreated || 'recently'}
                            </span>
                            ${dueStatus ? `
                                <span class="meta-item due-badge ${dueStatus.class}">
                                    <i class="fa-regular fa-calendar-check"></i> ${dueStatus.label}
                                </span>
                            ` : ''}
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="action-btn edit-btn" title="Edit Task" aria-label="Edit Task">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Delete Task" aria-label="Delete Task">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;

                // Add Event Listeners to item elements
                
                // 1. Completion Checkbox
                const checkbox = li.querySelector('.task-checkbox');
                checkbox.addEventListener('change', (e) => {
                    toggleTask(task.id, e.target.checked);
                });

                // 2. Double Click Title to Edit
                const titleSpan = li.querySelector('.task-title');
                titleSpan.addEventListener('dblclick', () => {
                    enableInlineEditing(li, task);
                });

                // 3. Edit Action Button
                const editBtn = li.querySelector('.edit-btn');
                editBtn.addEventListener('click', () => {
                    enableInlineEditing(li, task);
                });

                // 4. Delete Action Button
                const deleteBtn = li.querySelector('.delete-btn');
                deleteBtn.addEventListener('click', () => {
                    openDeleteModal(task);
                });

                taskList.appendChild(li);
            });
        }
    };

    // Enable Inline Editing interface
    const enableInlineEditing = (liElement, task) => {
        // Prevent editing already completed tasks (or let them, but it's cleaner to edit only active ones,
        // though we can edit both. Let's allow editing both!)
        const titleWrapper = liElement.querySelector('.task-content');
        const actionsWrapper = liElement.querySelector('.task-actions');
        const originalTitle = task.title;

        // Hide regular metadata / title view
        const currentTitleSpan = liElement.querySelector('.task-title');
        const currentMeta = liElement.querySelector('.task-meta');
        currentTitleSpan.style.display = 'none';
        if (currentMeta) currentMeta.style.display = 'none';

        // Create edit form elements
        const editContainer = document.createElement('div');
        editContainer.className = 'edit-input-wrapper';
        
        const editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.className = 'edit-input';
        editInput.value = originalTitle;
        editContainer.appendChild(editInput);
        
        titleWrapper.insertBefore(editContainer, titleWrapper.firstChild);
        editInput.focus();
        editInput.select();

        // Swap edit/delete actions for save/cancel
        actionsWrapper.innerHTML = `
            <button class="action-btn save-btn" title="Save" aria-label="Save">
                <i class="fa-solid fa-check"></i>
            </button>
            <button class="action-btn cancel-btn" title="Cancel" aria-label="Cancel">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        const saveBtn = actionsWrapper.querySelector('.save-btn');
        const cancelBtn = actionsWrapper.querySelector('.cancel-btn');

        // Close and clean up editing controls
        const finishEditing = async (save) => {
            const newValue = editInput.value.trim();
            let success = true;
            if (save && newValue !== originalTitle) {
                success = await updateTaskTitle(task.id, newValue);
            }
            
            // If API update failed, do not revert edit fields immediately, or if canceled/successful, rebuild normal view
            if (success || !save) {
                renderTasksList();
            }
        };

        // Event listeners for Save/Cancel
        saveBtn.addEventListener('click', () => finishEditing(true));
        cancelBtn.addEventListener('click', () => finishEditing(false));

        editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishEditing(true);
            } else if (e.key === 'Escape') {
                finishEditing(false);
            }
        });
    };

    // HTML Escaper helper to prevent XSS issues
    const escapeHTML = (str) => {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    };

    // --- Modal Implementation ---
    const openDeleteModal = (task) => {
        taskToDeleteId = task.id;
        modalTaskPreviewTitle.textContent = `"${task.title}"`;
        deleteModal.classList.add('open');
    };

    const closeDeleteModal = () => {
        deleteModal.classList.remove('open');
        taskToDeleteId = null;
    };

    confirmDeleteBtn.addEventListener('click', async () => {
        if (taskToDeleteId) {
            await deleteTask(taskToDeleteId);
            closeDeleteModal();
        }
    });

    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    
    // Close modal on background click
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });

    // --- Forms & Inputs Events ---

    // Submit New Task Form
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = taskTitleInput.value.trim();
        const dueDate = taskDueDateInput.value;
        
        if (title) {
            addTask(title, dueDate);
        }
    });

    // Live search filter input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (searchQuery) {
            clearSearchBtn.style.display = 'block';
        } else {
            clearSearchBtn.style.display = 'none';
        }
        renderTasksList();
    });

    // Clear search keyword
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderTasksList();
        searchInput.focus();
    });

    // Filter Buttons Event Handlers
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            renderTasksList();
        });
    });

    // Run Initialization
    initTheme();
    fetchTasks();
});
