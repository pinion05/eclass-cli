import { getConfig, type EclassConfig } from '../config/config.js';
import { BrowserClient } from '../transports/browser-client.js';
import { CourseService } from '../domain/services/course-service.js';
import { AssignmentService } from '../domain/services/assignment-service.js';
import { MaterialService } from '../domain/services/material-service.js';

export async function createAppContext() {
  const config = getConfig();
  const browser = new BrowserClient();
  try {
    await browser.launch();
    await browser.login(config);
  } catch (error) {
    await browser.close();
    throw error;
  }

  const courseService = new CourseService(browser);
  const assignmentService = new AssignmentService(browser, config);
  const materialService = new MaterialService(browser, courseService);

  return { config, browser, courseService, assignmentService, materialService };
}
