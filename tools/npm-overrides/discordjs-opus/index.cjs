'use strict';

const error = new Error("Cannot find module '@discordjs/opus'");
error.code = 'MODULE_NOT_FOUND';

throw error;
