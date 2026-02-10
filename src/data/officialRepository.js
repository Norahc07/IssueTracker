/**
 * Official company repository items.
 * Each item: title, description, tags, content (detail body).
 */
export const OFFICIAL_REPOSITORY_ITEMS = [
  {
    slug: 'daily-tasks',
    title: 'Daily Tasks',
    description: 'Standard procedures and checklist for daily operations.',
    tags: ['tasks', 'daily', 'sop'],
    content: `

<ol>
  <li>Update the WordPress plugins for all listed domains, including both Migrated New Domains and Migrated Old Domains. Before starting, inform the team which domain group (old or new) you will be updating.<br><em>Location: Task page → Domains tab</em><br><br>Here is the <a href="https://drive.google.com/file/d/1uUg7b_HUmGR7_LzK_fVw47UF09qtqtwc/view" target="_blank" rel="noopener noreferrer">tutorial video</a> for updating plugins.</li><br>
  <li>Always check the Knowles Intern Monitoring Excel file to see if there are onboarding and offboarding interns.<br><em>Location: Onboarding / Offboarding page</em></li><br>
  <li>Check the <a href="https://ssgcgroup-my.sharepoint.com/:w:/g/personal/erick_umonics_sg/EeQkz51Gl2NDnL8AkdjkuHUBkJSuW4FmM7oVHRAX6Qq5Yw?rtime=Y0OCAcn03Ug" target="_blank" rel="noopener noreferrer">Monitoring Team Daily Report</a>, take note of interns with less than 200 hours and include it on the daily report.</li><br>
  <li>Google Search Console Tasks: Check the GSC Crawling tutorial tab.<br><em>Location: Repository page → GSC Crawling</em></li><br>
  <li>Continue with Course list price edits.<br><em>Location: Repository page → Course List Price Edit Task</em></li><br>
  <li>At the end of the day, the team member assigned will send the daily report link to Sir Mark Erick Cabral via MS Teams chat each day. You can find previous reports <a href="https://docs.google.com/document/d/1mA6gaITrhTVByzMunE9RyJ24GwATnn4_mVETDsyHjYA/edit?tab=t.th60toxm6hnx#heading=h.pmyqyla6ms6" target="_blank" rel="noopener noreferrer">here</a> for reference.</li><br>
</ol>
<p><strong>Updated team daily report repository link: <a href="https://docs.google.com/document/d/1qr0_7wd7ZTHEcIUmiNtCkglp7_vlIZmrn8Aczba2huc/edit?tab=t.uhkbw12ep3lw#heading=h.610h68d4lnxx" target="_blank" rel="noopener noreferrer">Team Daily Report</a></strong></p>
`.trim(),
  },
  {
    slug: 'gsc-crawling',
    title: 'GSC Crawling',
    description: 'Google Search Console crawling setup and monitoring.',
    tags: ['gsc', 'seo', 'crawling'],
    content: `
<h2>GOOGLE SEARCH CONSOLE CRAWLING TASK</h2>

<h3>GSC Console Account</h3>
<p><em>Need MFA from Sir Mark for first log in — just message him.</em></p>
<p><a href="https://search.google.com/search-console/welcome" target="_blank" rel="noopener noreferrer">Welcome to Google Search Console</a></p>
<p>Username: <code>knowlestraininginstitute2@gmail.com</code><br>Password: <code>Idontknow1!</code></p>
<p><strong>NOTE:</strong> Make sure you are logged into Google Search Console using the credentials above.</p>

<p>Go to this link: <a href="https://search.google.com/search-console/" target="_blank" rel="noopener noreferrer">Google Search Console</a></p>

<ol>
  <li>Check this Excel sheet for the list of countries to be crawled.</li>
  <li>Select appropriate domain property.<br><img src="/gsc-crawling/step2Image.png" alt="Select domain property" class="max-w-xl mx-auto rounded border border-gray-200" /></li>
  <li>Go to URL Inspection tab and choose the same URL, then click Enter.</li>
  <li>
    <strong>IF URL is on Google:</strong><br>
    <img src="/gsc-crawling/urlOnGoogleImage.png" alt="URL on Google" class="max-w-full rounded border border-gray-200" /><br>
    Highlight the cell containing the URL green.<br><br>
    <strong>IF URL is not on Google:</strong><br>
    <img src="/gsc-crawling/urlNotOnGoogleImage.png" alt="URL not on Google" class="max-w-full rounded border border-gray-200" /><br>
    Click Request Indexing and try again later.
  </li>
</ol>
<p><strong>NOTE:</strong> If the URL cannot be indexed, tell Sir Mark and document the error on the spreadsheet.</p>

<p><strong>Video tutorial:</strong> <a href="https://drive.google.com/file/d/1Isifz0bxUYoO2jxDUg4y-yZy-0GaAnOZ/view" target="_blank" rel="noopener noreferrer">GSC Crawling.mp4 - Google Drive</a></p>
`.trim(),
  },
  {
    slug: 'credentials',
    title: 'Credentials',
    description: 'How to access and manage credentials securely.',
    tags: ['credentials', 'security', 'access'],
    content: 'Content for Credentials will be added here.',
  },
  {
    slug: 'offboarding-intern',
    title: 'Offboarding Intern',
    description: 'Steps and checklist for intern offboarding.',
    tags: ['offboarding', 'intern', 'hr'],
    content: 'Content for Offboarding Intern will be added here.',
  },
  {
    slug: 'email-format-coc-cll',
    title: 'Email format for COC and CLL',
    description: 'Standard email templates for Code of Conduct and CLL communications.',
    tags: ['email', 'coc', 'cll', 'template'],
    content: 'Content for Email format for COC and CLL will be added here.',
  },
  {
    slug: 'knowles-training-plan',
    title: 'Knowles Training Plan',
    description: 'Training plan and materials for Knowles programs.',
    tags: ['training', 'knowles', 'plan'],
    content: 'Content for Knowles Training Plan will be added here.',
  },
  {
    slug: 'course-list-price-edit-task',
    title: 'Course List Price Edit Task',
    description: 'Process for editing course list prices.',
    tags: ['course', 'price', 'edit', 'task'],
    content: 'Content for Course List Price Edit Task will be added here.',
  },
  {
    slug: 'team-leader-tasks',
    title: 'Team Leader Tasks',
    description: 'Responsibilities and tasks for team leaders.',
    tags: ['team leader', 'tasks', 'tl'],
    content: 'Content for Team Leader Tasks will be added here.',
  },
  {
    slug: 'adding-sitemap-gsc',
    title: 'Adding sitemap in GSC',
    description: 'How to add and verify sitemaps in Google Search Console.',
    tags: ['sitemap', 'gsc', 'seo'],
    content: 'Content for Adding sitemap in GSC will be added here.',
  },
  {
    slug: 'unblocking-wordpress-domain',
    title: 'Unblocking WordPress domain',
    description: 'Steps to unblock a WordPress domain (e.g. after lockout).',
    tags: ['wordpress', 'domain', 'unblock'],
    content: 'Content for Unblocking WordPress domain will be added here.',
  },
  {
    slug: 'daily-task-coordination-sop',
    title: 'Daily Task Coordination SOP',
    description: 'Standard operating procedure for daily task coordination.',
    tags: ['sop', 'daily', 'coordination', 'tasks'],
    content: 'Content for Daily Task Coordination SOP will be added here.',
  },
  {
    slug: 'course-price-table',
    title: 'Course Price Table',
    description: 'Reference for course pricing and table updates.',
    tags: ['course', 'price', 'table'],
    content: 'Content for Course Price Table will be added here.',
  },
];

export function getRepositoryItemBySlug(slug) {
  return OFFICIAL_REPOSITORY_ITEMS.find((item) => item.slug === slug) || null;
}
