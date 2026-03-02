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
  <li>Select appropriate domain property.<br><img src="/gsc-crawling/step2Image.png" alt="Select domain property" style="max-width: 520px; width: 100%; height: auto;" class="mx-auto rounded border border-gray-200" /></li>
  <li>Go to URL Inspection tab and choose the same URL, then click Enter.</li>
  <li>
    <strong>IF URL is on Google:</strong><br>
    <img src="/gsc-crawling/urlOnGoogleImage.png" alt="URL on Google" style="max-width: 520px; width: 100%; height: auto;" class="mx-auto rounded border border-gray-200" /><br>
    Highlight the cell containing the URL green.<br><br>
    <strong>IF URL is not on Google:</strong><br>
    <img src="/gsc-crawling/urlNotOnGoogleImage.png" alt="URL not on Google" style="max-width: 520px; width: 100%; height: auto;" class="mx-auto rounded border border-gray-200" /><br>
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
    content: `
<p><a href="https://ssgcgroup-my.sharepoint.com/:o:/g/personal/erick_umonics_sg/EgUccFhGkEFBrXvYbGyI6boBhJiYUeTU1FmYBf_BBI4maA?e=whT8ZV" target="_blank" rel="noopener noreferrer">OneNote Link to SOPs</a></p>
<hr>

<h3>GSC Console Account:</h3>
<p><em>Need MFA from Sir Mark for first log in.</em></p>
<p>Username: <code>knowlestraininginstitute2@gmail.com</code><br>Password: <code>Idontknow1!</code></p>
<hr>

<h3>Canva Account:</h3>
<p><em>(for COC and CCL making) Need MFA from Sir Mark for first log in.</em></p>
<p>Username: <code>erick@umonics.sg</code><br>Password: <code>8%3R$£O&lt;gnGOog|hF47G</code></p>
<hr>

<h3>TAWK.TO Account:</h3>
<p>Username: <code>alaiza@knowlesti.sg</code><br>Password: <code>Idontknow1!</code></p>
<hr>

<h3>InMotion Hosting:</h3>
<p><em>If it doesn’t work, ask Monitoring or Sir Mark if it is changed.</em></p>
<p><a href="https://secure1.inmotionhosting.com/amp/" target="_blank" rel="noopener noreferrer">https://secure1.inmotionhosting.com/amp/</a></p>
<p>Username: <code>it@ssgc.group</code><br>Password: <code>mQPAL&amp;gr&amp;5*EpS$TMqJ9ZBath%wgilXJvDc2bCfnV2v*FtAB02</code></p>
<hr>

<h3>WordPress:</h3>
<p>Username: <code>knowlesticom</code><br>Password: <code>6roH_cra?9S1Ut==rl3+!KEWRa#ifri0aBREcItOt#Obe$=tut</code></p>
<hr>

<h3>Sir Mark Signature:</h3>
<p><img src="/gsc-crawling/SirMarkSign.png" alt="Sir Mark signature" style="max-width: 220px; height: auto;" /></p>
`.trim(),
  },
  {
    slug: 'offboarding-intern',
    title: 'Offboarding Intern',
    description: 'Steps and checklist for intern offboarding.',
    tags: ['offboarding', 'intern', 'hr'],
    content: `
<p>When an intern reaches out for Sir Erick’s signature for their clearance form, ask permission from Sir Erick first before providing his signature.</p>

<h3>Sir Mark Signature:</h3>
<p><img src="/gsc-crawling/SirMarkSign.png" alt="Sir Mark signature" style="max-width: 220px; height: auto;" /></p>

<hr>

<p>Here is the proper process for handling tasking whenever an <strong>offboarded intern</strong> reaches out to request their <strong>Certificate of Internship Letter Completion (CLL)</strong> and <strong>Certificate of Completion (COC)</strong>.</p>

<ol>
  <li>
    <strong>Log in to Canva</strong>
    <ul>
      <li>You can see the log-in credentials in the credentials tab. Go to <strong>Repository page → Credentials</strong>.</li>
      <li>You will need the MFA code from Sir Erick.</li>
      <li>Send him a message via MS Teams requesting access since you’ll be creating a CLL and COC for an offboarded intern.</li>
    </ul>
  </li>
  <li>
    <strong>Verify the ICF</strong>
    <ul>
      <li>Before proceeding, confirm that the intern has a fully signed <strong>Internship Completion Form (ICF)</strong>.</li>
      <li>If they do not provide it, request the document from them for your reference.</li>
    </ul>
  </li>
  <li>
    <strong>Coordinate with HR</strong>
    <ul>
      <li>Contact our HR representative / Sir Carl and confirm whether the intern has submitted <strong>all required documents</strong> to the company.</li>
      <li>Only after HR’s confirmation should you proceed with creating the CLL and COC.</li>
    </ul>
  </li>
  <li>
    <strong>Gather details from the Monitoring Team Leader</strong>
    <ul>
      <li>As outlined in the SOP, request the following information from the Monitoring TL:</li>
      <li>Full Name</li>
      <li>Start Date</li>
      <li>End Date</li>
      <li>Hours Rendered</li>
      <li>Designation (be descriptive in mentioning the team and tasks)</li>
    </ul>
  </li>
  <li>
    <strong>Create the Certificates in Canva</strong>
    <ul>
      <li>Use the existing templates in Canva.</li>
      <li><strong>Duplicate the existing page</strong> to preserve the original template.</li>
      <li>Fill in the intern’s details carefully and ensure everything is accurate (double-check spelling, dates, and hours rendered since these are official documents submitted to the university).</li>
      <li>For the <strong>CLL</strong>, include the descriptive details of the intern’s role.</li>
      <li>For the <strong>COC</strong>, the format is simpler since you only need to update the intern’s name and total hours rendered.</li>
    </ul>
  </li>
  <li>
    <strong>Final Review and Submission</strong>
    <ul>
      <li>Once completed, review both documents thoroughly.</li>
      <li>After verifying accuracy, save them as PDF files. Follow the file name from the SOP.</li>
      <li>Send the certificates to the requesting intern via their email address, and CC both HR (Intern) and the Monitoring Team Leader for proper documentation. Please use the email template provided in the TL Assistant SOP.</li>
    </ul>
  </li>
</ol>

<p>Lastly, always double-check all details before releasing certificates, as errors can cause issues with the interns’ university requirements.</p>

<ul>
  <li>The Internship Certificate and Completion Letter will be sent to the intern on their last day of internship <strong>at 4:45 PM</strong>.</li>
  <li>For other interns who will offboard at an earlier time of the day, send the Internship Certificate and Completion Letter at least 15 minutes before their offboarding time.</li>
  <li>Use this email template for sending: go to <strong>Repository Page → Email format for COC and CLL</strong>.</li>
  <li>Upload the files on the <a href="https://ssgcgroup-my.sharepoint.com/:f:/g/personal/erick_umonics_sg/Ev_7W758YdlEvI29z9tex0QBTNSvY0BrjO2SErUvhMqW3w?e=sLomSH" target="_blank" rel="noopener noreferrer">OneDrive folder</a> with their respective folder. Create the folder with their lastname.</li>
</ul>
`.trim(),
  },
  {
    slug: 'email-format-coc-cll',
    title: 'Email format for COC and CLL',
    description: 'Standard email templates for Code of Conduct and CLL communications.',
    tags: ['email', 'coc', 'cll', 'template'],
    content: `
<h3>Email Structure for Sending Completion Files</h3>

<p><strong>Subject:</strong> Certificates for Internship in Knowles Training Institute</p>

<p>
Congratulations on your excellent job! I admire your dedication and wish you continued success in your job.
I hope your time here at Knowles Training Institute and applying for the Internship Training gave you insights
and experience that you could use in your future endeavors.
</p>

<p>Here are the following attached files for your completion:</p>
<ol>
  <li>Internship Completion Certificate Letter</li>
  <li>Internship Certificate of Completion</li>
</ol>

<p>
Again, we wish you good luck. If you have any questions or concerns just let us know.
</p>

<p>Best Regards,</p>
<p>
Your full name<br>
IT Team Lead Assistant
</p>

<p>
<img src="/KTI Logo.png" alt="KTI Logo" style="max-width: 180px; height: auto;" />
</p>
`.trim(),
  },
  {
    slug: 'knowles-training-plan',
    title: 'Knowles Training Plan',
    description: 'Training plan and materials for Knowles programs.',
    tags: ['training', 'knowles', 'plan'],
    content: `
<p>
Use this old document as reference when Sir Erick requests to fill up a document
such as MOA with Knowles Training Plan details.
</p>

<p>
Document link:
<a href="https://drive.google.com/file/d/1Gsvit6QZtcxuaiURjRctsB9UpEmBfr4H/view?usp=sharing"
   target="_blank"
   rel="noopener noreferrer">
  Knowles Training Plan Reference
</a>
</p>
`.trim(),
  },
  {
    slug: 'course-list-price-edit-task',
    title: 'Course List Price Edit Task',
    description: 'Process for editing course list prices.',
    tags: ['course', 'price', 'edit', 'task'],
    content: `
<p><strong>Watch the video tutorial first:</strong>
<a href="https://drive.google.com/file/d/10VMsej8M4hyzRpQav4PtkZdVs4FCeOZn/view?usp=sharing" target="_blank" rel="noopener noreferrer">
Course Lists Price Edit Tutorial.mp4
</a>
</p>

<ol>
  <li>
    Please go to this link
    <a href="https://ssgcgroup-my.sharepoint.com/:x:/g/personal/erick_umonics_sg/Ed0CVgnyWSBHmzhiCraSbhkBJdpouLGnowMKvPIciPwZRQ?rtime=7bbG_UIF3kg"
       target="_blank" rel="noopener noreferrer">
      Course List
    </a>
    to edit the prices of the courses.
  </li>
  <li>
    Now log in to the domain assigned to you
    (<strong>Knowles Domains Copy of Interns</strong> — found on the Task Assignment Log page, Domains tab).
  </li>
  <li>Go to the country assigned to you in the Course List spreadsheet.</li>
  <li>Find course titles that have a blank/white status and copy the title.</li>
  <li>Go back to the homepage of the Knowles domain, search, and paste the title.</li>
</ol>

<h3>Face-to-Face Pricing Logic</h3>

<p>
Prices are defined by:
</p>
<ul>
  <li>Country tier: <strong>Lower Tier</strong> vs <strong>Higher Tier</strong>.</li>
  <li>Course type: <strong>Generic</strong> vs <strong>Specialised</strong>.</li>
  <li>Session length: <strong>Lunch Talk</strong>, <strong>Half Day</strong>, <strong>Full Day</strong>, <strong>2 Day</strong>.</li>
</ul>

<h4>Lower Tier Countries – Face to Face Pricing (USD)</h4>
<p><em>Lower Tier Countries:</em> Belize, Kenya, Laos, Mexico, Nigeria, Pakistan, Philippines, Poland, South Africa, Taiwan, India, Indonesia.</p>

<table>
  <thead>
    <tr>
      <th rowspan="2">Country</th>
      <th colspan="4">Generic</th>
      <th colspan="4">Specialised</th>
    </tr>
    <tr>
      <th>Lunch Talk</th>
      <th>Half Day</th>
      <th>Full Day</th>
      <th>2 Day</th>
      <th>Lunch Talk</th>
      <th>Half Day</th>
      <th>Full Day</th>
      <th>2 Day</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Belize</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Kenya</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Laos</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Mexico</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Nigeria</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Pakistan</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Philippines</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Poland</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>South Africa</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Taiwan</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>India</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
    <tr>
      <td>Indonesia</td>
      <td>$679.97</td>
      <td>$259.97</td>
      <td>$419.97</td>
      <td>$569.97</td>
      <td>$1,019.96</td>
      <td>$389.96</td>
      <td>$629.96</td>
      <td>$854.96</td>
    </tr>
  </tbody>
</table>

<h4>Higher Tier Countries – Face to Face Pricing (USD)</h4>
<p><em>Higher Tier Countries:</em> Hong Kong, China, Denmark, Germany, Israel, Japan, Luxembourg, Netherlands, New Zealand, Norway, Qatar, Spain, UAE, UK.</p>

<table>
  <thead>
    <tr>
      <th rowspan="2">Country</th>
      <th colspan="4">Generic</th>
      <th colspan="4">Specialised</th>
    </tr>
    <tr>
      <th>Lunch Talk</th>
      <th>Half Day</th>
      <th>Full Day</th>
      <th>2 Day</th>
      <th>Lunch Talk</th>
      <th>Half Day</th>
      <th>Full Day</th>
      <th>2 Day</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Hong Kong</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>China</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Denmark</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Germany</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Israel</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Japan</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Luxembourg</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Netherlands</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>New Zealand</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Norway</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Qatar</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>Spain</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>UAE</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
    <tr>
      <td>UK</td>
      <td>$679.97</td>
      <td>$289.97</td>
      <td>$439.97</td>
      <td>$589.97</td>
      <td>$1,019.96</td>
      <td>$434.96</td>
      <td>$659.96</td>
      <td>$884.96</td>
    </tr>
  </tbody>
</table>

<h4>Prices for Singapore Domain (SGD)</h4>

<p><strong>Generic prices in SGD</strong></p>
<ul>
  <li>Lunch Talk – 889.97 per session</li>
  <li>Half Day – 389.97 per participant</li>
  <li>Full Day – 589.97 per participant</li>
  <li>2-full day – 789.97 per participant</li>
</ul>

<p><strong>Specialised prices in SGD</strong></p>
<ul>
  <li>Lunch Talk – 1,334.96 per session</li>
  <li>Half Day – 584.96 per participant</li>
  <li>Full Day – 884.96 per participant</li>
  <li>2-full day – 1,184.96 per participant</li>
</ul>
`.trim(),
  },
  {
    slug: 'team-leader-tasks',
    title: 'Team Leader Tasks',
    description: 'Responsibilities and tasks for team leaders.',
    tags: ['team leader', 'tasks', 'tl'],
    content: `
<ol>
  <li>
    <strong>Assigning an intern for Udemy Course Review</strong> <em>(This task is currently on hold)</em>
    <p>Choose only one of the interns to do the Udemy course review.</p>
    <p><em>Format:</em> [Fullname - Email]</p>

    <p>Message the assigned intern, you can use this draft:</p>
    <blockquote>
      Good day, Hope you’re doing great! If you have a moment, could you please write a review for these
      <a href="https://docs.google.com/document/d/1cax-m-AqpdtOb6cWZgjMk5bbcykEKGeXsnVNQLK6buc/edit?tab=t.0" target="_blank" rel="noopener noreferrer">Udemy courses</a>,
      there are only 2 links of courses. This will only take about 15 minutes as you only need to skip to the end.
      The instructions are also provided in the document. You can do this anytime today before 5 PM. Thank you!
    </blockquote>

    <p>Send the screenshots to Sir Erick around <strong>5 PM</strong> on MS Teams chat, with the name of intern.</p>
    <p>
      <img src="/ssNames.png" alt="Sample screenshot naming format" style="max-width: 520px; width: 100%; height: auto;" />
    </p>
  </li>

  <li>
    <strong>Assigning an intern for Knowles Google Review</strong> <em>(Tuesday and Thursday only)</em>
    <p>Message the assigned intern, you can use this draft:</p>
    <blockquote>
      Good day, If you have a moment, could you please leave a quick Google review for Knowles Training Institute?
      It will only take less than a minute, and your feedback would really help us out.<br><br>
      Just click the link and kindly leave a rating, write a one-sentence review with your full name.
      Let me know once done.<br><br>
      Thank you so much for your time!
    </blockquote>
  </li>

  <li>
    <strong>Continue with</strong>
    <a href="/repository/view/daily-tasks">Daily Tasks</a>
    <strong>and</strong>
    <a href="/repository/view/course-list-price-edit-task">Price edits</a>
  </li>
</ol>

<p><em>Note:</em> If the screenshot is not showing, make sure <code>ssNames.png</code> is placed in <code>client/public/</code>.</p>
`.trim(),
  },
  {
    slug: 'adding-sitemap-gsc',
    title: 'Adding sitemap in GSC',
    description: 'How to add and verify sitemaps in Google Search Console.',
    tags: ['sitemap', 'gsc', 'seo'],
    content: `
<p>
  <img src="/sitemap.jpg" alt="Adding sitemap in Google Search Console" style="max-width: 720px; width: 100%; height: auto;" />
</p>
`.trim(),
  },
  {
    slug: 'unblocking-wordpress-domain',
    title: 'Unblocking WordPress domain',
    description: 'Steps to unblock a WordPress domain (e.g. after lockout).',
    tags: ['wordpress', 'domain', 'unblock'],
    content: `
<p>Login to the domain. If you are locked out on that domain, ask other team members to unblock you.</p>

<p>
  <img src="/unblockWP1.png" alt="Unblocking WordPress domain step 1" style="max-width: 720px; width: 100%; height: auto;" />
</p>

<p>
  <img src="/unblockWP2.png" alt="Unblocking WordPress domain step 2" style="max-width: 720px; width: 100%; height: auto;" />
</p>
`.trim(),
  },
  {
    slug: 'daily-task-coordination-sop',
    title: 'Daily Task Coordination SOP',
    description: 'Standard operating procedure for daily task coordination.',
    tags: ['sop', 'daily', 'coordination', 'tasks'],
    content: `
<h2>Standard Operating Procedure (SOP): Daily Task Coordination</h2>

<h3>1. Purpose</h3>
<p>
To establish a streamlined, real-time task coordination process that prevents duplicate work,
ensures accountability, and maintains operational continuity across the IT Team Lead Assistant group.
</p>
<hr>

<h3>2. Scope</h3>
<p>This procedure applies to all IT Team Lead Assistants responsible for:</p>
<ul>
  <li>GSC Crawling</li>
  <li>WordPress Plugin Updates</li>
  <li>Any additional recurring technical tasks assigned by the IT Team Lead</li>
</ul>
<hr>

<h3>3. Responsibilities</h3>
<p><strong>Team Leader</strong></p>
<ul>
  <li>Oversees adherence to the SOP.</li>
  <li>Ensures the Task Assignment Log is consistently maintained.</li>
  <li>Conducts daily review of task distribution and coverage.</li>
</ul>

<p><strong>Team Members</strong></p>
<ul>
  <li>Must claim tasks in the Task Assignment Log before execution.</li>
  <li>Must update the log accurately after completing tasks.</li>
  <li>Must submit an Individual Daily Report by the required time.</li>
</ul>
<hr>

<h3>4. Tools Required</h3>
<ul>
  <li>
    Shared
    <a href="https://docs.google.com/spreadsheets/d/1ikp8cqbZ1PwZbAzjGELjbz4dOch8zEVzDBB7oja5724/edit?usp=sharing"
       target="_blank" rel="noopener noreferrer">
      Task Assignment Log
    </a>
    (Google Sheets)
  </li>
  <li>Individual Daily Report</li>
  <li>MS Teams (for coordination and updates)</li>
</ul>
<hr>

<h3>5. Process Workflow</h3>

<h4>5.1. Task Claiming Procedure (Real-Time Logging)</h4>
<p>Before starting any recurring task, team members must:</p>
<ol>
  <li>Open the Task Assignment Log.</li>
  <li>Select the task to be worked on (e.g., GSC Crawling, Plugin Updates – Old/New Domains).</li>
  <li>
    Fill out the following fields:
    <ul>
      <li>Assigned To</li>
      <li>Start Time</li>
      <li>Priority (High / Medium / Low)</li>
      <li>Status (Not Started / In Progress / Complete / Cancelled)</li>
      <li>Notes (if applicable)</li>
      <li>Mark Complete upon finishing the task</li>
    </ul>
  </li>
</ol>

<p><strong>Important:</strong></p>
<ul>
  <li>Only one person may claim a specific recurring task per cycle.</li>
  <li>If a task is already claimed, team members must select another task or await further instruction from the Team Leader.</li>
</ul>
<hr>

<h4>5.2. Task Execution</h4>
<ol>
  <li>Perform the assigned task following established technical guidelines.</li>
  <li>Ensure proper documentation of outputs or issues encountered.</li>
  <li>If encountering access blocks or system errors, immediately report to the Team Leader before proceeding.</li>
</ol>
<hr>

<h4>5.3. Task Completion Logging</h4>
<p>Once the task is completed, the team member must update the Task Assignment Log by:</p>
<ul>
  <li>Checking the <strong>Complete</strong> box.</li>
  <li>Noting any findings, discrepancies, or required follow-up actions.</li>
</ul>
<hr>

<h4>5.4. Daily Report Submission</h4>
<p>
Each team member must submit an <strong>Individual Daily Report</strong> summarizing their tasks, outcomes,
and relevant notes. Submit before <strong>5 PM</strong> to the Team Lead.
</p>
<hr>

<h3>6. Team Leader Daily Review</h3>
<ol>
  <li>Review the Task Assignment Log for completeness and accuracy.</li>
  <li>Compile all updates into the <strong>Team Daily Report</strong>.</li>
  <li>Submit the consolidated report to the IT Team Lead.</li>
</ol>
<hr>

<h3>7. Compliance</h3>
<p>Failure to follow this SOP may result in:</p>
<ul>
  <li>Duplicate work</li>
  <li>Misaligned task coverage</li>
  <li>Incomplete documentation and reporting</li>
</ul>
<p>All team members are expected to follow this SOP consistently.</p>
<hr>

<h3>8. Revision and Updates</h3>
<p>This SOP must be reviewed and updated quarterly or when operational requirements change.</p>
`.trim(),
  },
  {
    slug: 'course-price-table',
    title: 'Course Price Table',
    description: 'Reference for course pricing and table updates.',
    tags: ['course', 'price', 'table'],
    content: `
<p><strong>Legend:</strong></p>
<ul>
  <li>✅ Double Checked</li>
  <li>⏳ In progress</li>
</ul>

<table>
  <thead>
    <tr>
      <th>Domain</th>
      <th>Status</th>
      <th>Notes</th>
      <th>Checked By</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Singapore</td>
      <td>
        <select>
          <option value="in-progress" selected>⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td>POSTPONED</td>
      <td>Danisse Cabana</td>
    </tr>
    <tr>
      <td>Belize</td>
      <td>
        <select>
          <option value="in-progress" selected>⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td>POSTPONED</td>
      <td>Leilah Baruc</td>
    </tr>
    <tr>
      <td>Kenya</td>
      <td>
        <select>
          <option value="in-progress" selected>⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td>POSTPONED</td>
      <td>Christian Reggie Camba</td>
    </tr>
    <tr>
      <td>Mexico</td>
      <td>
        <select>
          <option value="in-progress" selected>⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td>POSTPONED</td>
      <td>Mykha Abarques</td>
    </tr>
    <tr>
      <td>Nigeria</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Laos</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Pakistan</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Philippines</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Poland</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>South Africa</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Hong Kong</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Taiwan</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>India</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Indonesia</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Germany</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Denmark</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>China</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Netherlands</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Japan</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Norway</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Qatar</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Spain</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>UAE</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>UK</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Luxembourg</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Israel</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>New Zealand</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Timor-Leste</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>Sweden</td>
      <td>
        <select>
          <option value="in-progress">⏳ In progress</option>
          <option value="double-checked">✅ Double Checked</option>
        </select>
      </td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>
`.trim(),
  },
  {
    slug: 'onboarding-user-account-creation',
    title: 'Tutorial: User/Account Creation for Onboarding',
    description: 'Steps for creating user accounts when onboarding new interns.',
    tags: ['onboarding', 'tutorial', 'account', 'user'],
    content: `
<h2>Intern Account &amp; Onboarding Setup Guide</h2>

<p>This guide explains how to:</p>
<ul>
  <li>Create intern / TL / VTL accounts in <strong>Supabase Auth</strong> (with passwords).</li>
  <li>Record them in the app via <strong>Onboarding → Add onboarding record</strong>.</li>
  <li>Sync onboarding records into <code>auth.users</code> display name and <code>public.users</code> so they appear across the system (TL/VTL Tracker, attendance, etc.).</li>
</ul>

<p><strong>Important:</strong> Passwords are only handled in Supabase Auth. The app and database never store raw passwords.</p>

<hr />

<h3>1. Create the account in Supabase Auth (email + password only)</h3>
<p>Do this once per intern / TL / VTL.</p>
<ol>
  <li>Go to <strong>Supabase Dashboard → Auth → Users</strong>.</li>
  <li>Click <strong>Add user</strong>.</li>
  <li>Fill in:
    <ul>
      <li><strong>Email</strong>: same email that will be used in the onboarding record.</li>
      <li><strong>Password</strong>: your standard internship password (for example <code>KTI-Intern-2026!</code>).
        You give this password to the intern; you may keep one shared password per batch.</li>
    </ul>
  </li>
  <li>You can leave <strong>User metadata / Display name</strong> empty. It will be filled later from onboarding.</li>
  <li>Leave other fields as default, then click <strong>Create user</strong>.</li>
</ol>

<p>Repeat for all interns and staff who need login accounts.</p>

<hr />

<h3>2. Add the intern to Onboarding records (in the app)</h3>
<p>Do this inside the app once the account exists in Auth.</p>
<ol>
  <li>Open the app and go to <code>/onboarding?onboarding_tab=records</code>.</li>
  <li>Click <strong>Add onboarding</strong>.</li>
  <li>In the modal, fill in:
    <ul>
      <li><strong>Onboarding date</strong> (required).</li>
      <li><strong>Onboarding time</strong> (optional).</li>
      <li><strong>Start date</strong> (optional but recommended).</li>
      <li><strong>Department</strong>: IT, HR, or Marketing.</li>
      <li><strong>Name</strong>: this becomes the display name in Supabase and <code>full_name</code> in <code>public.users</code>, e.g. <code>Juan Dela Cruz</code>.</li>
      <li><strong>Email</strong>: use the same email as the Auth account (step 1).</li>
      <li><strong>Team</strong> (only when Department = IT): Team Lead Assistant, PAT1, or Monitoring Team.</li>
    </ul>
  </li>
  <li>Click <strong>Save onboarding</strong>.</li>
</ol>

<p>After saving, the intern appears in the Onboarding records table. Once synced (next section), they are also in <code>auth.users</code> (Display name) and <code>public.users</code>, so all features see them.</p>

<hr />

<h3>3. Sync onboarding records into Auth display name and <code>public.users</code></h3>

<p>This step connects onboarding records to:</p>
<ul>
  <li><strong>Auth</strong>: sets <code>user_metadata.full_name</code> from the Onboarding <strong>Name</strong> so the Supabase Display name is the actual full name (not email).</li>
  <li><strong><code>public.users</code></strong>: ensures all onboarded interns exist and that <code>full_name</code> comes from onboarding so the app (e.g. Tasks “Assigned to”) shows the real name.</li>
</ul>

<p><strong>Onboarding Name is the source of truth</strong> for full name. The sync updates both new and existing users so <code>full_name</code> is always taken from the onboarding record when available.</p>

<p><strong>How to run:</strong></p>
<ol>
  <li>Open <strong>Supabase Dashboard → SQL Editor</strong>.</li>
  <li>Create a new query.</li>
  <li>Copy–paste the SQL below and run it.</li>
</ol>

<pre><code>-- 1) Set Auth user metadata full_name from onboarding_records.name (source of truth)
UPDATE auth.users u
SET raw_user_meta_data =
      COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', obr.name)
FROM public.onboarding_records obr
WHERE lower(obr.email) = lower(u.email)
  AND obr.name IS NOT NULL
  AND trim(obr.name) != '';

-- 2) UPDATE existing public.users: set full_name from onboarding so Tasks \"Assigned to\" gets actual name
UPDATE public.users u
SET full_name = obr.name
FROM public.onboarding_records obr
WHERE lower(u.email) = lower(obr.email)
  AND obr.name IS NOT NULL
  AND trim(obr.name) != '';

-- 3) INSERT new users: sync onboarding_records → public.users for accounts in auth that are not yet in public.users
INSERT INTO public.users (id, email, role, full_name, team)
SELECT
  au.id,
  au.email,
  'intern' AS role,
  COALESCE(obr.name, au.raw_user_meta_data ->> 'full_name') AS full_name,
  CASE
    WHEN lower(obr.department) = 'it' THEN
      CASE
        WHEN lower(obr.team) IN ('team lead assistant', 'tla') THEN 'tla'
        WHEN lower(obr.team) LIKE 'pat1%' THEN 'pat1'
        WHEN lower(obr.team) LIKE 'monitoring%' THEN 'monitoring_team'
        ELSE 'tla'
      END
    WHEN lower(obr.department) = 'hr' THEN 'hr'
    WHEN lower(obr.department) = 'marketing' THEN 'marketing'
    ELSE NULL
  END AS team
FROM public.onboarding_records obr
JOIN auth.users au
  ON lower(au.email) = lower(obr.email)
LEFT JOIN public.users pu
  ON pu.id = au.id
WHERE obr.email IS NOT NULL
  AND pu.id IS NULL;</code></pre>

<p>You can safely re-run this script whenever you add a new batch of interns or change names in onboarding.</p>

<hr />

<h3>4. How this affects other features</h3>

<p>Once steps 1–3 are done:</p>
<ul>
  <li><code>public.users</code> has an entry for each onboarded intern.</li>
  <li>The following pages automatically see them:
    <ul>
      <li>Onboarding records (merged view of onboarding + users).</li>
      <li>TL/VTL Tracker (<code>/tasks?tab=tl-vtl-tracker</code>) Name dropdown (intern / TL / VTL).</li>
      <li>Any other feature that reads from <code>public.users</code> (attendance, filters, etc.).</li>
    </ul>
  </li>
</ul>

<h4>TL / VTL assignment</h4>
<ul>
  <li>Use <code>/tasks?tab=tl-vtl-tracker</code> to assign TL/VTL roles:
    <ul>
      <li>In edit mode, choose a Name from the dropdown (intern / TL / VTL).</li>
      <li>Choose Role (<code>Team Leader</code> or <code>Vice Team Leader</code>).</li>
      <li>Click Save.</li>
    </ul>
  </li>
  <li>The system will update the user’s <code>role</code> in <code>public.users</code> and normalize their <code>team</code> (tla, monitoring_team, pat1, etc.).</li>
</ul>

<hr />

<h3>5. Summary</h3>
<ul>
  <li><strong>Auth (Supabase Users)</strong>: where emails and passwords live.</li>
  <li><strong>Onboarding records</strong>: HR / onboarding details; the <strong>Name</strong> field is the source of truth for the person’s full name.</li>
  <li><strong>Sync SQL</strong>: copies onboarding Name into Auth and <code>public.users</code> so:
    <ul>
      <li>New users are inserted into <code>public.users</code> with <code>full_name</code> from onboarding.</li>
      <li>Existing users are updated so <code>full_name</code> (and Auth display name) comes from onboarding, not email.</li>
    </ul>
  </li>
  <li><strong>Tasks “Assigned to”</strong> and other dropdowns read <code>full_name</code> from <code>public.users</code>; after running the sync, they show the actual full name from onboarding.</li>
</ul>
`.trim(),
  },
  {
    slug: 'domains-wp-updates-steps',
    title: 'Domains WP Updates Steps',
    description: 'Step-by-step guide for WordPress plugin updates on old and new domains.',
    tags: ['domains', 'wordpress', 'plugins', 'updates', 'wp'],
    content: `
<h2>Domains WordPress Plugin Updates</h2>

<p>This guide is aligned with the current system flow in the Tasks page.</p>

<p><strong>Location in the app:</strong> <code>/tasks?tab=domains</code> and <code>/tasks?tab=domain-claims</code></p>

<h3>Step 1. Go to Tasks → Domains and claim your domains</h3>
<ol>
  <li>
    Open the <strong>Tasks</strong> page and switch to the <strong>Domains</strong> tab.
  </li>
  <li>
    At the top of the Domains tab, choose which list you will work on:
    <ul>
      <li><strong>Old Domains</strong> – migrated old Knowles domains.</li>
      <li><strong>New Domains</strong> – migrated new Knowles domains.</li>
    </ul>
  </li>
  <li>
    In the table, use the <strong>Claim</strong> column:
    <ul>
      <li>Click <strong>Claim</strong> on the domains you will update today.</li>
      <li>The row will highlight in light green and show a green <strong>Claimed</strong> pill.</li>
      <li>Your claim will appear in the <strong>Domain Claims</strong> tab (<code>/tasks?tab=domain-claims</code>), separated by Old vs New domains.</li>
    </ul>
  </li>
</ol>

<h3>Step 2. Open the domain details from Domains WP Updates Steps</h3>
<p>After claiming, use this repository page as the detailed checklist for plugin updates.</p>
<ol>
  <li>
    In the Domains tab, find the domain you claimed.
  </li>
  <li>
    Click the <strong>URL</strong> link in the table to open the site in a new tab.
  </li>
  <li>
    Decide which account to use:
    <ul>
      <li><strong>Old Domains</strong>:
        <ul>
          <li>Use the default <strong>Intern Account WordPress</strong> and <strong>SG Domain WordPress</strong> credentials shown at the top of the Old Domains tab.</li>
          <li>These credentials are shared across all old domains.</li>
        </ul>
      </li>
      <li><strong>New Domains</strong>:
        <ul>
          <li>Use the <strong>WP Username</strong> and <strong>New Password</strong> shown in that specific row.</li>
          <li>Each new domain can have its own username and password.</li>
        </ul>
      </li>
    </ul>
  </li>
</ol>

<h3>Step 3. Log in to WordPress and update plugins</h3>
<ol>
  <li>Go to <code>https://&lt;domain&gt;/wp-admin</code>.</li>
  <li>Log in using the correct credentials (old domain default, or per-domain credentials for new domains).</li>
  <li>Navigate to <strong>Plugins → Installed Plugins</strong>.</li>
  <li>Update the plugins that require updates:
    <ul>
      <li>Update one plugin at a time or in small batches to avoid issues.</li>
      <li>Wait for each update to complete and ensure there are no visible errors.</li>
    </ul>
  </li>
</ol>

<h3>Step 4. Collect plugin update details (for the system)</h3>
<p>After updating, you will log the details in the system (Domains tab and related tasks). For each plugin you updated, collect:</p>
<ul>
  <li><strong>Plugin name</strong></li>
  <li><strong>Version before</strong> the update</li>
  <li><strong>Version after</strong> the update</li>
  <li><strong>Update status</strong> (e.g. Updated, Skipped, Failed)</li>
  <li><strong>Post‑update check</strong> result:
    <ul>
      <li>Site loads correctly (front‑end).</li>
      <li>No errors in the WordPress dashboard.</li>
    </ul>
  </li>
  <li><strong>Notes</strong> (optional) – any errors, warnings, or special handling required.</li>
</ul>

<p>These details are used to populate the <strong>Domain Claims</strong> and plugin update tracking from the system (via the Domain Updates task flow).</p>

<h3>Step 5. Update the Domains tab and related tasks</h3>
<ol>
  <li>
    In the <strong>Domains</strong> tab, update the columns for the domain you worked on:
    <ul>
      <li><strong>Status</strong> (Updated / Not updated).</li>
      <li><strong>Scanning</strong> and <strong>Date</strong> (if applicable).</li>
      <li><strong>Plugin</strong>, <strong>2FA</strong>, <strong>reCAPTCHA</strong>, and <strong>Backup</strong> checkboxes, matching what you configured.</li>
    </ul>
  </li>
  <li>
    Make sure the Domain Claims view (<code>/tasks?tab=domain-claims</code>) shows:
    <ul>
      <li>Your name as <strong>Intern Name</strong>.</li>
      <li>The date you claimed/updated.</li>
      <li><strong>Update Status</strong> and <strong>Post Update Check</strong> filled from the plugin update details.</li>
    </ul>
  </li>
</ol>

<h3>Step 6. Notes and troubleshooting</h3>
<ul>
  <li>If you are <strong>locked out</strong> of a domain, ask another team member to unblock you. See <a href="/repository/view/unblocking-wordpress-domain">Unblocking WordPress domain</a>.</li>
  <li>For the <strong>SG Domain WordPress</strong> credentials, do <strong>NOT</strong> change the password unless specifically instructed.</li>
  <li>If a plugin update fails or causes an error, record the details in the Notes and inform the Team Lead / Monitoring TL.</li>
</ul>
`.trim(),
  },
];

export function getRepositoryItemBySlug(slug) {
  return OFFICIAL_REPOSITORY_ITEMS.find((item) => item.slug === slug) || null;
}
