const vscode = acquireVsCodeApi();

// Task management state
let allTasks = [];
let taskFilters = { status: 'all', sort: 'date-desc' };

function renderTasks(tasks) {
    const list = document.getElementById('task-list');
    if (!list) return;
    list.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        list.innerHTML = '<div class="empty-state">No active tasks. Ask Vibey to start a task!</div>';
        return;
    }

    tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'task-item';

        let stepsHtml = '';
        if (task.steps && task.steps.length > 0) {
            stepsHtml = '<ul class="step-list">' +
                task.steps.map(s => `<li>[${s.status === 'completed' ? 'x' : ' '}] ${s.description}</li>`).join('') +
                '</ul>';
        }

        item.innerHTML = `\n            <div class="task-header">\n                <span class="task-title">${task.title}</span>\n                <span class="task-status status-${task.status}"> ${task.status}</span>\n            </div>\n            <div class="task-steps">${stepsHtml}</div>\n        `;
        list.appendChild(item);
    });
}

function filterAndRenderTasks() {
    let filtered = allTasks;
    
    if (taskFilters.status !== 'all') {
        filtered = filtered.filter(t => t.status === taskFilters.status);
    }
    
    if (taskFilters.sort === 'date-asc') {
        filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } else if (taskFilters.sort === 'date-desc') {
        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (taskFilters.sort === 'priority') {
        const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
        filtered.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));
    }
    
    renderTasks(filtered);
}

function updateTaskFilter(status, sort) {
    if (status !== undefined) taskFilters.status = status;
    if (sort !== undefined) taskFilters.sort = sort;
    filterAndRenderTasks();
}

// Export for use in other modules
export { 
    allTasks, 
    taskFilters, 
    renderTasks, 
    filterAndRenderTasks, 
    updateTaskFilter 
};