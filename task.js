const schedule = require('node-schedule');

const { printSync } = require('./tasks/print');

module.exports = {
  initTask: async () => {
    await printSync();

    const updater = require('./main').updater;
    
    const ruleForMinute = new schedule.RecurrenceRule();
    ruleForMinute.minute = [0];

    schedule.scheduleJob(ruleForMinute, async () => {
        await printSync();
    });

    schedule.scheduleJob(ruleForMinute, async () => {
      if (updater) {
        await updater.checkForUpdates(true);
      }
    });
  }
}