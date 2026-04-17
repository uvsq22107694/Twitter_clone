const z = require('zod');

const variableFormats = {         
    usernameFormat : z.string("d'un format invalide").trim().min(1,{error : "trop court"}).max(30,{error : "trop long"}),     
    passwordFormat : z.string("d'un format invalide").trim().min(1,{error : "trop court"}).max(50,{error : "trop long"}),     
    textFormat : z.string("d'un format invalide").trim().min(1,{error : "trop court"}).max(280,{error : "trop long"}),      
    idFormat : z.coerce.number("d'un format invalide").int("d'un format invalide"),
    dateFormat : z.string()
}; 

const signinSchema = z.object({ 
    username : variableFormats.usernameFormat, 
    password : variableFormats.passwordFormat, 
    passwordConfirmation : variableFormats.passwordFormat 
});

const loginSchema = z.object({ 
    username : variableFormats.usernameFormat, 
    password : variableFormats.passwordFormat 
}); 

const postMessageSchema = z.object({
    text : variableFormats.textFormat,
});

const getMessageSchema = z.object({
    limit : variableFormats.idFormat.default(10),
    offset : variableFormats.idFormat.default(0),
    loadAfterLatest : variableFormats.dateFormat.optional()
});

const consversationSchema = z.object({ 
    recipient : variableFormats.usernameFormat 
});

const postPrivateMessageSchema = z.object({ 
    conversationId : variableFormats.idFormat,
    text : variableFormats.textFormat  
}) ;

const getPrivateMessageSchema = z.object({ 
    conversationId : variableFormats.idFormat,
}) ;

module.exports = { 
    signinSchema,
    loginSchema,
    postMessageSchema,
    getMessageSchema,
    consversationSchema,
    postPrivateMessageSchema,
    getPrivateMessageSchema
};