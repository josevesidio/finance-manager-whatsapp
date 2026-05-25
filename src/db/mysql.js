export const upsert = async (model, values, condition) => {
  return model.findOne({ where: condition }).then(function (obj) {
    if (obj) {
      return obj.update(values)
    }
    return model.create(values)
  })
}

const bulkCreate = async (model, values, options) => {
  return model.bulkCreate(values, options)
}

const create = async (model, values) => {
  return model.create(values)
}

const getOne = async (model, condition) => {
  return await model.findOne({ where: condition })
}

const getAll = async (model, condition, order) => {
  return await model.findAll({ where: condition, order })
}

const getAllAttributes = async (model, condition, attributes) => {
  return await model.findAll({
    where: condition,
    order: [['id', 'DESC']],
    attributes
  })
}

const getAllAttributesInstallment = async (model, condition, attributes) => {
  return await model.findAll({
    where: condition,
    order: [
      ['number', 'ASC'],
      ['id', 'DESC']
    ],
    attributes
  })
}

const getOneAttributes = async (model, condition, attributes) => {
  try {
    return await model.findOne({
      where: condition,
      attributes
    })
  } catch {
    return null
  }
}

const clearAll = async (model) => {
  return model.destroy({ where: {}, truncate: true })
}

export default {
  upsert,
  bulkCreate,
  // bulkLoadDataInfile,
  getOne,
  create,
  getAll,
  getAllAttributes,
  getOneAttributes,
  getAllAttributesInstallment,
  clearAll
}
