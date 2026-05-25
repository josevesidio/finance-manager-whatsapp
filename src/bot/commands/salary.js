export function addSalary(message) {
    try{
        if(message.body.split('\n').length < 2){
            return 'Por favor, digite o salário do usuário.';
        }
        const salary = message.body.split('\n')[1];
        return 'Salário adicionado.';
    }catch(error){
        console.log(error);
        return 'Erro ao adicionar o salário.';
    }
}

export default { addSalary };