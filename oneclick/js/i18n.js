/* OneClick · translations (English / Arabic). t(key, vars) interpolates {name} placeholders. */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  const en = {
    nav: 'Navigation', footer: 'OneClick · Team Dashboard', welcome: 'Welcome to OneClick! Sample data is loaded — replace it with your own from each page or Settings.',
    close: 'Close', cancel: 'Cancel', save: 'Save', saved: 'Saved', delete: 'Delete', deleted: 'Deleted', edit: 'Edit', add: 'Add', all: 'All', status: 'Status', priority: 'Priority', notes: 'Notes', due: 'Due', sort: 'Sort', prev: 'Previous', next: 'Next',
    exportCsv: 'Export CSV', exported: 'Exported {n} rows', copied: 'Copied to clipboard', showing: 'Showing {n} of {total}', tryFilters: 'Try clearing the search or filters.',
    'form.required': '“{field}” is required.', 'form.number': '“{field}” must be a number.',
    'err.generic': 'Something went wrong. Please try again.', 'err.save': 'Could not save — browser storage may be full or blocked.', 'err.copy': 'Could not copy.',
    'rel.today': 'Today', 'rel.tomorrow': 'Tomorrow', 'rel.yesterday': 'Yesterday', 'rel.inDays': 'in {n} days', 'rel.daysAgo': '{n} days ago',
    'pri.high': 'High', 'pri.med': 'Medium', 'pri.low': 'Low',

    'home.title': 'Home', 'home.morning': 'Good morning', 'home.afternoon': 'Good afternoon', 'home.evening': 'Good evening', 'home.team': 'Team',
    'home.sub': '{date} · Week {week}. Everything your shift needs, one click away.',
    'home.onShiftNow': 'on shift now', 'home.onLeave': '{n} on leave', 'home.items': 'items tracked', 'home.out': '{n} out of stock', 'home.low': '{n} low', 'home.allStocked': 'All stocked',
    'home.eventsToday': 'events today', 'home.next7': '{n} in next 7 days', 'home.inQueue': 'in queue', 'home.printing': '{n} printing', 'home.available': 'available', 'home.inMaint': '{n} in maintenance', 'home.serviceDue': '{n} service due',
    'home.openIssues': 'open issues', 'home.lastShift': 'Last: {shift}', 'home.ideas': 'ideas', 'home.approved': '{n} approved', 'home.toReview': '{n} to review',
    'kpi.onShift': 'On shift', 'kpi.onShiftHint': 'team members available', 'kpi.lowStock': 'Stock alerts', 'kpi.outOfStock': '{n} out of stock', 'kpi.belowMin': 'below minimum', 'kpi.stockOk': 'all above minimum',
    'kpi.today': 'Today', 'kpi.nothingToday': 'Nothing scheduled', 'kpi.openIssues': 'Open issues', 'kpi.fromTurnovers': 'from shift turnovers', 'kpi.week': 'Week {n}', 'kpi.tasksDone': '{done} of {total} tasks done',

    'team.title': 'MyTeam', 'team.tag': 'Roster & availability', 'team.desc': 'Who is on shift, on leave or in training — with contacts in one place.',
    'team.add': 'Add member', 'team.edit': 'Edit member', 'team.added': '{name} added to the team', 'team.total': 'Team size', 'team.search': 'Search name, badge, role…', 'team.allStatus': 'All statuses', 'team.allShifts': 'All shifts',
    'team.f.name': 'Full name', 'team.f.badge': 'Badge no.', 'team.f.role': 'Role', 'team.f.shift': 'Shift', 'team.f.status': 'Status', 'team.f.phone': 'Phone', 'team.shift': 'Shift {s}',
    'team.s.on': 'On shift', 'team.s.off': 'Off duty', 'team.s.leave': 'On leave', 'team.s.training': 'Training',
    'team.statusSet': '{name}: {status}', 'team.delete': 'Remove member?', 'team.deleteMsg': '{name} will be removed from the roster.', 'team.empty': 'No team members', 'team.emptyHint': 'Add your first team member to get started.',

    'inventory.title': 'Inventory', 'inventory.tag': 'Stock vs. minimum', 'inventory.desc': 'Track quantities against minimum levels. Low and out-of-stock items float to the top.',
    'inventory.add': 'Add item', 'inventory.edit': 'Edit item', 'inventory.items': 'Items', 'inventory.lowHint': 'at or below minimum', 'inventory.outHint': 'need reorder now', 'inventory.search': 'Search item, SKU, location…', 'inventory.allCats': 'All categories',
    'inventory.sortStatus': 'Sort: status', 'inventory.sortName': 'Sort: name', 'inventory.sortQty': 'Sort: quantity', 'inventory.onlyLow': 'Only alerts',
    'inventory.f.name': 'Item', 'inventory.f.sku': 'SKU / code', 'inventory.f.category': 'Category', 'inventory.cats': 'Categories', 'inventory.f.qty': 'Quantity', 'inventory.f.min': 'Minimum', 'inventory.f.unit': 'Unit', 'inventory.f.location': 'Location',
    'inventory.l.ok': 'OK', 'inventory.l.low': 'Low', 'inventory.l.out': 'Out',
    'inventory.nowOut': '{name} is now out of stock', 'inventory.nowLow': '{name} reached its minimum', 'inventory.delete': 'Delete item?', 'inventory.deleteMsg': '{name} will be removed from inventory.', 'inventory.empty': 'No items', 'inventory.emptyHint': 'Add consumables, spares and PPE you want to keep an eye on.',

    'calendar.title': 'Calendar', 'calendar.tag': 'Meetings, PMs & training', 'calendar.desc': 'Shared team calendar. Click a day to see or add events.',
    'calendar.add': 'Add event', 'calendar.edit': 'Edit event', 'calendar.upcoming': 'Upcoming', 'calendar.noneDay': 'No events on this day.', 'calendar.noneUpcoming': 'Nothing coming up.',
    'calendar.f.title': 'Title', 'calendar.f.date': 'Date', 'calendar.f.time': 'Time', 'calendar.f.type': 'Type', 'calendar.f.notes': 'Notes',
    'calendar.t.meeting': 'Meeting', 'calendar.t.maintenance': 'Maintenance', 'calendar.t.training': 'Training', 'calendar.t.safety': 'Safety', 'calendar.t.other': 'Other',
    'calendar.delete': 'Delete event?', 'calendar.deleteMsg': '“{title}” will be removed.',

    'prints.title': '3D Prints', 'prints.tag': 'Print queue', 'prints.desc': 'Requests move from queue to printer to done. Drag cards between columns or use the buttons.',
    'prints.add': 'New request', 'prints.edit': 'Edit request', 'prints.search': 'Search item, requester…', 'prints.dragHint': 'Tip: drag a card to another column to change its status.', 'prints.emptyCol': 'Nothing here.',
    'prints.f.item': 'Part / item', 'prints.f.requester': 'Requested by', 'prints.f.material': 'Material', 'prints.f.qty': 'Quantity', 'prints.f.due': 'Needed by',
    'prints.s.queued': 'Queued', 'prints.s.printing': 'Printing', 'prints.s.done': 'Done', 'prints.s.failed': 'Failed',
    'prints.start': 'Start', 'prints.finish': 'Finish', 'prints.retry': 'Re-queue', 'prints.progress': 'Progress', 'prints.moved': '{item} → {status}', 'prints.delete': 'Delete request?', 'prints.deleteMsg': '“{item}” will be removed.',

    'vehicles.title': 'Vehicles', 'vehicles.tag': 'Fleet & check-out', 'vehicles.desc': 'Check vehicles in and out, flag maintenance and keep service dates in view.',
    'vehicles.add': 'Add vehicle', 'vehicles.edit': 'Edit vehicle', 'vehicles.search': 'Search vehicle, plate, driver…', 'vehicles.serviceDue': 'Service due', 'vehicles.serviceDueHint': 'within 14 days or overdue',
    'vehicles.f.name': 'Vehicle', 'vehicles.f.plate': 'Plate / ID', 'vehicles.f.type': 'Type', 'vehicles.f.assigned': 'Assigned to', 'vehicles.f.mileage': 'Mileage (km)', 'vehicles.f.nextService': 'Next service',
    'vehicles.t.pickup': 'Pickup', 'vehicles.t.van': 'Van', 'vehicles.t.truck': 'Truck', 'vehicles.t.bus': 'Bus', 'vehicles.t.forklift': 'Forklift', 'vehicles.t.other': 'Other',
    'vehicles.s.available': 'Available', 'vehicles.s.inuse': 'In use', 'vehicles.s.maintenance': 'Maintenance', 'vehicles.sv.overdue': 'overdue', 'vehicles.sv.soon': 'due soon',
    'vehicles.checkout': 'Check out {name}', 'vehicles.checkoutBtn': 'Check out', 'vehicles.checkin': 'Check in {name}', 'vehicles.checkinBtn': 'Check in', 'vehicles.checkedOut': '{name} checked out to {who}', 'vehicles.checkedIn': '{name} is back and available',
    'vehicles.mileageErr': 'Mileage cannot be lower than the previous reading.', 'vehicles.toMaint': 'Maintenance', 'vehicles.backInService': 'Back in service', 'vehicles.sentMaint': '{name} marked for maintenance', 'vehicles.nowAvailable': '{name} is available again',
    'vehicles.delete': 'Delete vehicle?', 'vehicles.deleteMsg': '{name} will be removed from the fleet.', 'vehicles.empty': 'No vehicles', 'vehicles.emptyHint': 'Add the vehicles your team shares.',

    'week.title': 'Week Completion', 'week.completion': 'Completion', 'week.n': 'Week {n}', 'week.desc': 'Weekly commitments drive the gauge. Tick tasks as they finish; carry the rest to next week.',
    'week.addTask': 'Add task', 'week.edit': 'Edit task', 'week.quickPh': 'Quick add a task for this week and press Enter…', 'week.thisWeek': 'This week', 'week.current': 'Current week',
    'week.open': 'Open', 'week.done': 'Done', 'week.unassigned': 'Unassigned', 'week.overdue': 'overdue', 'week.byOwner': 'By owner', 'week.noOwners': 'No tasks yet.',
    'week.f.title': 'Task', 'week.f.owner': 'Owner', 'week.f.week': 'Week no.', 'week.f.year': 'Year', 'week.badWeek': 'That year has only {n} weeks.',
    'week.carry': 'Carry over', 'week.carryMsg': 'Move {n} unfinished tasks to week {week}?', 'week.carryOk': 'Move tasks', 'week.carried': '{n} tasks moved to next week',
    'week.allDone': 'All tasks done — great week!', 'week.gaugeNote': 'Completion = done ÷ planned tasks for the selected week.', 'week.pastNote': 'This week has ended. Unfinished tasks count as overdue.',
    'week.delete': 'Delete task?', 'week.deleteMsg': '“{title}” will be removed.', 'week.empty': 'No tasks for this week', 'week.emptyHint': 'Add what the team committed to this week.',

    'turnover.title': 'Shift Turnover', 'turnover.tag': 'Handover log', 'turnover.desc': 'Every handover in one place. Open issues stay visible until someone resolves them.',
    'turnover.add': 'New handover', 'turnover.edit': 'Edit handover', 'turnover.entries': 'Handovers', 'turnover.openIssues': 'Open issues', 'turnover.openHint': 'carried between shifts', 'turnover.noOpen': 'No open issues', 'turnover.last': 'Last handover',
    'turnover.search': 'Search people, notes, issues…', 'turnover.onlyOpen': 'Only with open issues', 'turnover.day': 'Day shift', 'turnover.night': 'Night shift', 'turnover.nOpen': '{n} open',
    'turnover.f.date': 'Date', 'turnover.f.shift': 'Shift', 'turnover.f.from': 'Handed over by', 'turnover.f.to': 'Received by', 'turnover.f.summary': 'Summary', 'turnover.f.issues': 'Open issues',
    'turnover.summaryPh': 'What happened, what is running, what to watch…', 'turnover.issuesPh': 'One issue per line', 'turnover.copy': 'Copy as text', 'turnover.resolved': 'Issue resolved',
    'turnover.delete': 'Delete handover?', 'turnover.deleteMsg': 'The handover from {date} will be removed.', 'turnover.empty': 'No handovers yet', 'turnover.emptyHint': 'Log the first shift handover.',

    'ideas.title': 'Innovation', 'ideas.tag': 'Ideas & improvements', 'ideas.desc': 'Suggest improvements, vote for the best, and track them to implementation.',
    'ideas.add': 'Share an idea', 'ideas.edit': 'Edit idea', 'ideas.total': 'Ideas', 'ideas.reviewHint': 'new or under review', 'ideas.votes': 'Votes', 'ideas.search': 'Search ideas…', 'ideas.top': 'Top voted', 'ideas.newest': 'Newest',
    'ideas.f.title': 'Idea', 'ideas.f.by': 'Suggested by', 'ideas.f.desc': 'Describe it', 'ideas.descPh': 'What problem does it solve? What would change?',
    'ideas.s.new': 'New', 'ideas.s.review': 'Under review', 'ideas.s.approved': 'Approved', 'ideas.s.done': 'Implemented', 'ideas.s.rejected': 'Not now',
    'ideas.vote': 'Vote', 'ideas.voted': 'Vote counted', 'ideas.thanks': 'Thanks — idea added!', 'ideas.statusSet': 'Status: {status}', 'ideas.delete': 'Delete idea?', 'ideas.deleteMsg': '“{title}” will be removed.', 'ideas.empty': 'No ideas yet', 'ideas.emptyHint': 'Be the first to suggest an improvement.',

    'settings.title': 'Settings', 'settings.tag': 'Preferences & data', 'settings.desc': 'Appearance, language, and backup of everything stored in this browser.',
    'settings.appearance': 'Appearance', 'settings.teamName': 'Team name', 'settings.teamNameHint': 'Shown on the home page and in the sidebar.', 'settings.lang': 'Language', 'settings.langHint': 'Interface language and text direction.',
    'settings.theme': 'Theme', 'settings.themeHint': 'Dark glass or light.', 'settings.dark': 'Dark', 'settings.light': 'Light', 'settings.bg': 'Background', 'settings.bgHint': 'Turn off the 3D animation on slower computers.', 'settings.bg3d': '3D animated', 'settings.bgMin': 'Minimal',
    'settings.firstDay': 'Week starts on', 'settings.firstDayHint': 'First day shown in the calendar grid.', 'settings.sunday': 'Sunday', 'settings.monday': 'Monday',
    'settings.data': 'Data', 'settings.dataNote': 'OneClick stores everything locally in this browser (no server). Export a backup to move it to another computer or share it with the team.',
    'settings.size': '{kb} KB stored', 'settings.c.team': 'members', 'settings.c.inventory': 'items', 'settings.c.events': 'events', 'settings.c.prints': 'prints', 'settings.c.vehicles': 'vehicles', 'settings.c.tasks': 'tasks', 'settings.c.turnovers': 'handovers', 'settings.c.ideas': 'ideas',
    'settings.backup': 'Backup & restore', 'settings.backupHint': 'Download a JSON file, or restore one.', 'settings.export': 'Export backup', 'settings.exported': 'Backup downloaded', 'settings.import': 'Import backup', 'settings.importMsg': 'Replace all current data with the contents of {name}?', 'settings.imported': 'Backup restored', 'settings.importErr': 'That file is not a valid OneClick backup.',
    'settings.sample': 'Sample data', 'settings.sampleHint': 'Replace everything with the demo dataset.', 'settings.loadSample': 'Load sample data', 'settings.sampleMsg': 'All current data will be replaced with sample data.', 'settings.sampleLoaded': 'Sample data loaded',
    'settings.wipe': 'Start fresh', 'settings.wipeHint': 'Delete all data from this browser. Export a backup first.', 'settings.wipeBtn': 'Delete all data', 'settings.wipeMsg': 'This permanently deletes all team, inventory, calendar, print, vehicle, task, handover and idea data from this browser.', 'settings.wiped': 'All data deleted',
    'settings.about': 'About', 'settings.aboutText': 'OneClick is a self-contained team dashboard: no installation, no server, works offline. Open it in any modern browser; for a shared team view, publish the folder on your intranet and import a common backup.',
    'settings.shortcuts': 'Shortcuts', 'settings.kEsc': 'close dialog', 'settings.kSearch': 'focus search', 'settings.kNav': 'open section', 'settings.kHome': 'home'
  };

  const ar = {
    nav: 'التنقل', footer: 'OneClick · لوحة الفريق', welcome: 'أهلًا بك في OneClick! تم تحميل بيانات تجريبية، استبدلها ببياناتك من كل صفحة أو من الإعدادات.',
    close: 'إغلاق', cancel: 'إلغاء', save: 'حفظ', saved: 'تم الحفظ', delete: 'حذف', deleted: 'تم الحذف', edit: 'تعديل', add: 'إضافة', all: 'الكل', status: 'الحالة', priority: 'الأولوية', notes: 'ملاحظات', due: 'الموعد', sort: 'ترتيب', prev: 'السابق', next: 'التالي',
    exportCsv: 'تصدير CSV', exported: 'تم تصدير {n} صف', copied: 'تم النسخ', showing: 'عرض {n} من {total}', tryFilters: 'جرّب مسح البحث أو الفلاتر.',
    'form.required': 'حقل «{field}» مطلوب.', 'form.number': 'حقل «{field}» يجب أن يكون رقمًا.',
    'err.generic': 'حدث خطأ ما، حاول مرة أخرى.', 'err.save': 'تعذّر الحفظ، قد تكون ذاكرة المتصفح ممتلئة أو محظورة.', 'err.copy': 'تعذّر النسخ.',
    'rel.today': 'اليوم', 'rel.tomorrow': 'غدًا', 'rel.yesterday': 'أمس', 'rel.inDays': 'بعد {n} يوم', 'rel.daysAgo': 'قبل {n} يوم',
    'pri.high': 'عالية', 'pri.med': 'متوسطة', 'pri.low': 'منخفضة',

    'home.title': 'الرئيسية', 'home.morning': 'صباح الخير', 'home.afternoon': 'مساء الخير', 'home.evening': 'مساء الخير', 'home.team': 'الفريق',
    'home.sub': '{date} · الأسبوع {week}. كل ما تحتاجه الوردية بضغطة واحدة.',
    'home.onShiftNow': 'على رأس العمل الآن', 'home.onLeave': '{n} في إجازة', 'home.items': 'صنف متابَع', 'home.out': '{n} نفد', 'home.low': '{n} منخفض', 'home.allStocked': 'المخزون سليم',
    'home.eventsToday': 'أحداث اليوم', 'home.next7': '{n} خلال ٧ أيام', 'home.inQueue': 'في الانتظار', 'home.printing': '{n} قيد الطباعة', 'home.available': 'متاحة', 'home.inMaint': '{n} في الصيانة', 'home.serviceDue': '{n} تحتاج صيانة',
    'home.openIssues': 'مسائل مفتوحة', 'home.lastShift': 'الأخيرة: {shift}', 'home.ideas': 'فكرة', 'home.approved': '{n} معتمدة', 'home.toReview': '{n} للمراجعة',
    'kpi.onShift': 'على رأس العمل', 'kpi.onShiftHint': 'أعضاء متاحون', 'kpi.lowStock': 'تنبيهات المخزون', 'kpi.outOfStock': '{n} نفد', 'kpi.belowMin': 'تحت الحد الأدنى', 'kpi.stockOk': 'الكل فوق الحد الأدنى',
    'kpi.today': 'اليوم', 'kpi.nothingToday': 'لا يوجد شيء مجدول', 'kpi.openIssues': 'مسائل مفتوحة', 'kpi.fromTurnovers': 'من تسليم الورديات', 'kpi.week': 'الأسبوع {n}', 'kpi.tasksDone': 'أُنجزت {done} من {total} مهمة',

    'team.title': 'فريقي', 'team.tag': 'الكادر والتوفر', 'team.desc': 'من على رأس العمل، ومن في إجازة أو تدريب، مع أرقام التواصل في مكان واحد.',
    'team.add': 'إضافة عضو', 'team.edit': 'تعديل عضو', 'team.added': 'تمت إضافة {name} للفريق', 'team.total': 'حجم الفريق', 'team.search': 'ابحث بالاسم أو الرقم الوظيفي أو الدور…', 'team.allStatus': 'كل الحالات', 'team.allShifts': 'كل الورديات',
    'team.f.name': 'الاسم الكامل', 'team.f.badge': 'الرقم الوظيفي', 'team.f.role': 'الدور', 'team.f.shift': 'الوردية', 'team.f.status': 'الحالة', 'team.f.phone': 'الجوال', 'team.shift': 'وردية {s}',
    'team.s.on': 'على رأس العمل', 'team.s.off': 'خارج الدوام', 'team.s.leave': 'إجازة', 'team.s.training': 'تدريب',
    'team.statusSet': '{name}: {status}', 'team.delete': 'إزالة العضو؟', 'team.deleteMsg': 'سيُزال {name} من قائمة الفريق.', 'team.empty': 'لا يوجد أعضاء', 'team.emptyHint': 'أضف أول عضو في الفريق للبدء.',

    'inventory.title': 'المخزون', 'inventory.tag': 'الكمية مقابل الحد الأدنى', 'inventory.desc': 'تابع الكميات مقابل الحد الأدنى. الأصناف المنخفضة والنافدة تظهر في الأعلى.',
    'inventory.add': 'إضافة صنف', 'inventory.edit': 'تعديل صنف', 'inventory.items': 'الأصناف', 'inventory.lowHint': 'عند الحد الأدنى أو أقل', 'inventory.outHint': 'تحتاج طلب الآن', 'inventory.search': 'ابحث بالصنف أو الرمز أو الموقع…', 'inventory.allCats': 'كل الفئات',
    'inventory.sortStatus': 'ترتيب: الحالة', 'inventory.sortName': 'ترتيب: الاسم', 'inventory.sortQty': 'ترتيب: الكمية', 'inventory.onlyLow': 'التنبيهات فقط',
    'inventory.f.name': 'الصنف', 'inventory.f.sku': 'الرمز', 'inventory.f.category': 'الفئة', 'inventory.cats': 'الفئات', 'inventory.f.qty': 'الكمية', 'inventory.f.min': 'الحد الأدنى', 'inventory.f.unit': 'الوحدة', 'inventory.f.location': 'الموقع',
    'inventory.l.ok': 'سليم', 'inventory.l.low': 'منخفض', 'inventory.l.out': 'نفد',
    'inventory.nowOut': 'نفد {name} من المخزون', 'inventory.nowLow': 'وصل {name} إلى الحد الأدنى', 'inventory.delete': 'حذف الصنف؟', 'inventory.deleteMsg': 'سيُحذف {name} من المخزون.', 'inventory.empty': 'لا توجد أصناف', 'inventory.emptyHint': 'أضف المستهلكات وقطع الغيار ومعدات السلامة التي تريد متابعتها.',

    'calendar.title': 'التقويم', 'calendar.tag': 'اجتماعات وصيانة وتدريب', 'calendar.desc': 'تقويم الفريق المشترك. اضغط على يوم لعرض أحداثه أو إضافة حدث.',
    'calendar.add': 'إضافة حدث', 'calendar.edit': 'تعديل حدث', 'calendar.upcoming': 'القادم', 'calendar.noneDay': 'لا أحداث في هذا اليوم.', 'calendar.noneUpcoming': 'لا يوجد شيء قادم.',
    'calendar.f.title': 'العنوان', 'calendar.f.date': 'التاريخ', 'calendar.f.time': 'الوقت', 'calendar.f.type': 'النوع', 'calendar.f.notes': 'ملاحظات',
    'calendar.t.meeting': 'اجتماع', 'calendar.t.maintenance': 'صيانة', 'calendar.t.training': 'تدريب', 'calendar.t.safety': 'سلامة', 'calendar.t.other': 'أخرى',
    'calendar.delete': 'حذف الحدث؟', 'calendar.deleteMsg': 'سيُحذف «{title}».',

    'prints.title': 'الطباعة ثلاثية الأبعاد', 'prints.tag': 'طابور الطباعة', 'prints.desc': 'الطلبات تنتقل من الانتظار إلى الطباعة إلى الإنجاز. اسحب البطاقات بين الأعمدة أو استخدم الأزرار.',
    'prints.add': 'طلب جديد', 'prints.edit': 'تعديل الطلب', 'prints.search': 'ابحث بالقطعة أو الطالب…', 'prints.dragHint': 'تلميح: اسحب البطاقة إلى عمود آخر لتغيير حالتها.', 'prints.emptyCol': 'لا شيء هنا.',
    'prints.f.item': 'القطعة', 'prints.f.requester': 'طلبها', 'prints.f.material': 'الخامة', 'prints.f.qty': 'الكمية', 'prints.f.due': 'مطلوبة بتاريخ',
    'prints.s.queued': 'في الانتظار', 'prints.s.printing': 'قيد الطباعة', 'prints.s.done': 'منجزة', 'prints.s.failed': 'فشلت',
    'prints.start': 'ابدأ', 'prints.finish': 'إنهاء', 'prints.retry': 'إعادة للطابور', 'prints.progress': 'التقدم', 'prints.moved': '{item} ← {status}', 'prints.delete': 'حذف الطلب؟', 'prints.deleteMsg': 'سيُحذف «{item}».',

    'vehicles.title': 'المركبات', 'vehicles.tag': 'الأسطول والاستلام', 'vehicles.desc': 'استلم المركبات وسلّمها، وحدّد ما يحتاج صيانة، وتابع مواعيد الخدمة.',
    'vehicles.add': 'إضافة مركبة', 'vehicles.edit': 'تعديل مركبة', 'vehicles.search': 'ابحث بالمركبة أو اللوحة أو السائق…', 'vehicles.serviceDue': 'صيانة مستحقة', 'vehicles.serviceDueHint': 'خلال ١٤ يومًا أو متأخرة',
    'vehicles.f.name': 'المركبة', 'vehicles.f.plate': 'اللوحة / الرقم', 'vehicles.f.type': 'النوع', 'vehicles.f.assigned': 'مع', 'vehicles.f.mileage': 'العداد (كم)', 'vehicles.f.nextService': 'الصيانة القادمة',
    'vehicles.t.pickup': 'بيك أب', 'vehicles.t.van': 'فان', 'vehicles.t.truck': 'شاحنة', 'vehicles.t.bus': 'باص', 'vehicles.t.forklift': 'رافعة شوكية', 'vehicles.t.other': 'أخرى',
    'vehicles.s.available': 'متاحة', 'vehicles.s.inuse': 'مستخدمة', 'vehicles.s.maintenance': 'صيانة', 'vehicles.sv.overdue': 'متأخرة', 'vehicles.sv.soon': 'قريبًا',
    'vehicles.checkout': 'استلام {name}', 'vehicles.checkoutBtn': 'استلام', 'vehicles.checkin': 'تسليم {name}', 'vehicles.checkinBtn': 'تسليم', 'vehicles.checkedOut': 'استلم {who} المركبة {name}', 'vehicles.checkedIn': 'عادت {name} وأصبحت متاحة',
    'vehicles.mileageErr': 'لا يمكن أن يكون العداد أقل من القراءة السابقة.', 'vehicles.toMaint': 'صيانة', 'vehicles.backInService': 'عودة للخدمة', 'vehicles.sentMaint': 'تم تحويل {name} للصيانة', 'vehicles.nowAvailable': 'أصبحت {name} متاحة من جديد',
    'vehicles.delete': 'حذف المركبة؟', 'vehicles.deleteMsg': 'ستُحذف {name} من الأسطول.', 'vehicles.empty': 'لا توجد مركبات', 'vehicles.emptyHint': 'أضف المركبات التي يتشاركها الفريق.',

    'week.title': 'إنجاز الأسبوع', 'week.completion': 'نسبة الإنجاز', 'week.n': 'الأسبوع {n}', 'week.desc': 'التزامات الأسبوع هي ما يحرّك المؤشر. علّم المهام عند إنجازها، ورحّل الباقي للأسبوع التالي.',
    'week.addTask': 'إضافة مهمة', 'week.edit': 'تعديل مهمة', 'week.quickPh': 'أضف مهمة سريعة لهذا الأسبوع واضغط Enter…', 'week.thisWeek': 'هذا الأسبوع', 'week.current': 'الأسبوع الحالي',
    'week.open': 'مفتوحة', 'week.done': 'منجزة', 'week.unassigned': 'غير مسندة', 'week.overdue': 'متأخرة', 'week.byOwner': 'حسب المسؤول', 'week.noOwners': 'لا مهام بعد.',
    'week.f.title': 'المهمة', 'week.f.owner': 'المسؤول', 'week.f.week': 'رقم الأسبوع', 'week.f.year': 'السنة', 'week.badWeek': 'هذه السنة فيها {n} أسبوعًا فقط.',
    'week.carry': 'ترحيل', 'week.carryMsg': 'نقل {n} مهمة غير منجزة إلى الأسبوع {week}؟', 'week.carryOk': 'نقل المهام', 'week.carried': 'تم نقل {n} مهمة للأسبوع التالي',
    'week.allDone': 'كل المهام منجزة، أسبوع ممتاز!', 'week.gaugeNote': 'نسبة الإنجاز = المنجز ÷ المخطط للأسبوع المحدد.', 'week.pastNote': 'انتهى هذا الأسبوع. المهام غير المنجزة تُحسب متأخرة.',
    'week.delete': 'حذف المهمة؟', 'week.deleteMsg': 'ستُحذف «{title}».', 'week.empty': 'لا مهام لهذا الأسبوع', 'week.emptyHint': 'أضف ما التزم به الفريق هذا الأسبوع.',

    'turnover.title': 'تسليم الوردية', 'turnover.tag': 'سجل التسليم', 'turnover.desc': 'كل عمليات التسليم في مكان واحد. المسائل المفتوحة تبقى ظاهرة حتى يحلّها أحد.',
    'turnover.add': 'تسليم جديد', 'turnover.edit': 'تعديل التسليم', 'turnover.entries': 'عمليات التسليم', 'turnover.openIssues': 'مسائل مفتوحة', 'turnover.openHint': 'منقولة بين الورديات', 'turnover.noOpen': 'لا مسائل مفتوحة', 'turnover.last': 'آخر تسليم',
    'turnover.search': 'ابحث بالأشخاص أو الملاحظات أو المسائل…', 'turnover.onlyOpen': 'ذات المسائل المفتوحة فقط', 'turnover.day': 'وردية نهارية', 'turnover.night': 'وردية ليلية', 'turnover.nOpen': '{n} مفتوحة',
    'turnover.f.date': 'التاريخ', 'turnover.f.shift': 'الوردية', 'turnover.f.from': 'سلّم', 'turnover.f.to': 'استلم', 'turnover.f.summary': 'الملخص', 'turnover.f.issues': 'المسائل المفتوحة',
    'turnover.summaryPh': 'ماذا حدث، ما الذي يعمل، وما الذي يجب مراقبته…', 'turnover.issuesPh': 'مسألة واحدة في كل سطر', 'turnover.copy': 'نسخ كنص', 'turnover.resolved': 'تم حل المسألة',
    'turnover.delete': 'حذف التسليم؟', 'turnover.deleteMsg': 'سيُحذف تسليم يوم {date}.', 'turnover.empty': 'لا يوجد تسليم بعد', 'turnover.emptyHint': 'سجّل أول تسليم وردية.',

    'ideas.title': 'الابتكار', 'ideas.tag': 'أفكار وتحسينات', 'ideas.desc': 'اقترح تحسينات، صوّت للأفضل، وتابعها حتى التنفيذ.',
    'ideas.add': 'شارك فكرة', 'ideas.edit': 'تعديل الفكرة', 'ideas.total': 'الأفكار', 'ideas.reviewHint': 'جديدة أو قيد المراجعة', 'ideas.votes': 'الأصوات', 'ideas.search': 'ابحث في الأفكار…', 'ideas.top': 'الأعلى تصويتًا', 'ideas.newest': 'الأحدث',
    'ideas.f.title': 'الفكرة', 'ideas.f.by': 'اقترحها', 'ideas.f.desc': 'الوصف', 'ideas.descPh': 'ما المشكلة التي تحلّها؟ وما الذي سيتغير؟',
    'ideas.s.new': 'جديدة', 'ideas.s.review': 'قيد المراجعة', 'ideas.s.approved': 'معتمدة', 'ideas.s.done': 'منفّذة', 'ideas.s.rejected': 'ليس الآن',
    'ideas.vote': 'تصويت', 'ideas.voted': 'تم احتساب صوتك', 'ideas.thanks': 'شكرًا، أُضيفت الفكرة!', 'ideas.statusSet': 'الحالة: {status}', 'ideas.delete': 'حذف الفكرة؟', 'ideas.deleteMsg': 'ستُحذف «{title}».', 'ideas.empty': 'لا أفكار بعد', 'ideas.emptyHint': 'كن أول من يقترح تحسينًا.',

    'settings.title': 'الإعدادات', 'settings.tag': 'التفضيلات والبيانات', 'settings.desc': 'المظهر واللغة والنسخ الاحتياطي لكل ما هو محفوظ في هذا المتصفح.',
    'settings.appearance': 'المظهر', 'settings.teamName': 'اسم الفريق', 'settings.teamNameHint': 'يظهر في الصفحة الرئيسية والقائمة الجانبية.', 'settings.lang': 'اللغة', 'settings.langHint': 'لغة الواجهة واتجاه النص.',
    'settings.theme': 'السمة', 'settings.themeHint': 'زجاجية داكنة أو فاتحة.', 'settings.dark': 'داكن', 'settings.light': 'فاتح', 'settings.bg': 'الخلفية', 'settings.bgHint': 'أوقف الحركة ثلاثية الأبعاد على الأجهزة البطيئة.', 'settings.bg3d': 'ثلاثية الأبعاد', 'settings.bgMin': 'بسيطة',
    'settings.firstDay': 'بداية الأسبوع', 'settings.firstDayHint': 'أول يوم يُعرض في شبكة التقويم.', 'settings.sunday': 'الأحد', 'settings.monday': 'الاثنين',
    'settings.data': 'البيانات', 'settings.dataNote': 'يحفظ OneClick كل شيء محليًا في هذا المتصفح (بدون خادم). صدّر نسخة احتياطية لنقلها إلى جهاز آخر أو مشاركتها مع الفريق.',
    'settings.size': '{kb} ك.ب محفوظة', 'settings.c.team': 'عضو', 'settings.c.inventory': 'صنف', 'settings.c.events': 'حدث', 'settings.c.prints': 'طباعة', 'settings.c.vehicles': 'مركبة', 'settings.c.tasks': 'مهمة', 'settings.c.turnovers': 'تسليم', 'settings.c.ideas': 'فكرة',
    'settings.backup': 'النسخ الاحتياطي والاستعادة', 'settings.backupHint': 'نزّل ملف JSON أو استعد واحدًا.', 'settings.export': 'تصدير نسخة', 'settings.exported': 'تم تنزيل النسخة', 'settings.import': 'استيراد نسخة', 'settings.importMsg': 'استبدال كل البيانات الحالية بمحتوى {name}؟', 'settings.imported': 'تمت الاستعادة', 'settings.importErr': 'هذا الملف ليس نسخة OneClick صالحة.',
    'settings.sample': 'بيانات تجريبية', 'settings.sampleHint': 'استبدل كل شيء بمجموعة البيانات التجريبية.', 'settings.loadSample': 'تحميل بيانات تجريبية', 'settings.sampleMsg': 'ستُستبدل كل البيانات الحالية بالبيانات التجريبية.', 'settings.sampleLoaded': 'تم تحميل البيانات التجريبية',
    'settings.wipe': 'بداية جديدة', 'settings.wipeHint': 'احذف كل البيانات من هذا المتصفح. صدّر نسخة احتياطية أولًا.', 'settings.wipeBtn': 'حذف كل البيانات', 'settings.wipeMsg': 'سيحذف هذا نهائيًا كل بيانات الفريق والمخزون والتقويم والطباعة والمركبات والمهام والتسليم والأفكار من هذا المتصفح.', 'settings.wiped': 'تم حذف كل البيانات',
    'settings.about': 'حول', 'settings.aboutText': 'OneClick لوحة فريق مستقلة: بلا تثبيت ولا خادم، وتعمل دون اتصال. افتحها في أي متصفح حديث؛ ولعرض مشترك للفريق انشر المجلد على الشبكة الداخلية واستوردوا نسخة احتياطية موحدة.',
    'settings.shortcuts': 'الاختصارات', 'settings.kEsc': 'إغلاق النافذة', 'settings.kSearch': 'الانتقال للبحث', 'settings.kNav': 'فتح القسم', 'settings.kHome': 'الرئيسية'
  };

  const dict = { en, ar };
  const missing = new Set();
  OC.i18n = { dict, missing };
  OC.t = (key, vars) => {
    const lang = (OC.db && OC.db.settings && OC.db.settings.lang) || 'en';
    let s = dict[lang][key];
    if (s == null) s = en[key];
    if (s == null) { missing.add(key); return key; }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m);
    return s;
  };
})(window.OC);
