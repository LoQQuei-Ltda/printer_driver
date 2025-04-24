const schedule = require('node-schedule');

const { printSync } = require('./tasks/print');
const { printersSync } = require('./tasks/printers');

module.exports = {
  initTask: async () => {
    await printSync();
    await printersSync();

    const updater = require('./main').updater;
    
    const ruleForMinute = new schedule.RecurrenceRule();
    ruleForMinute.minute = [0];

    const ruleForZeroSecond = new schedule.RecurrenceRule();
    ruleForZeroSecond.second = [0];

    schedule.scheduleJob(ruleForZeroSecond, async () => {
        await printSync();
    });

    schedule.scheduleJob('*/5 * * * *', async () => {
        await printersSync();
    });

    schedule.scheduleJob(ruleForMinute, async () => {
      if (updater) {
        await updater.checkForUpdates(true);
      }
    });
  }
}