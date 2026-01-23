import { Resolver, Query, Mutation, Args, ObjectType, Field, InputType } from '@nestjs/graphql';
import { BotEngineService } from '../../bot-engine/bot-engine.service';
import { StateMachineService, ConversationStateMachine } from '../../bot-engine/services/state-machine.service';
import { ConversationsService } from '../../conversations/conversations.service';

@InputType()
class ProcessMessageInput {
  @Field()
  companyId: string;

  @Field()
  userId: string;

  @Field()
  message: string;

  @Field({ nullable: true })
  phone?: string;
}

@ObjectType()
class ProcessMessageResponse {
  @Field()
  reply: string;

  @Field()
  intention: string;

  @Field()
  confidence: number;

  @Field(() => [String])
  missingFields: string[];

  @Field()
  conversationState: string;

  @Field({ nullable: true })
  conversationId?: string;
}

@ObjectType()
class ConversationFields {
  @Field({ nullable: true })
  date?: string;

  @Field({ nullable: true })
  time?: string;

  @Field({ nullable: true })
  guests?: number;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  service?: string;

  @Field(() => [String], { nullable: true })
  products?: string[];

  @Field({ nullable: true })
  address?: string;

  @Field({ nullable: true })
  tableId?: string;
}

@ObjectType()
class ConversationStateResponse {
  @Field({ nullable: true })
  intent: string | null;

  @Field()
  state: string;

  @Field(() => ConversationFields)
  fields: ConversationFields;

  @Field({ nullable: true })
  metadata?: string;
}

@Resolver()
export class BotResolver {
  constructor(
    private botEngine: BotEngineService,
    private stateMachine: StateMachineService,
    private conversations: ConversationsService,
  ) {}

  @Mutation(() => ProcessMessageResponse)
  async processMessage(
    @Args('input') input: ProcessMessageInput,
  ): Promise<ProcessMessageResponse> {
    const result = await this.botEngine.processMessage({
      companyId: input.companyId,
      userId: input.userId,
      message: input.message,
      phone: input.phone,
    });

    return {
      reply: result.reply,
      intention: result.intention,
      confidence: result.confidence,
      missingFields: result.missingFields || [],
      conversationState: result.conversationState,
      conversationId: result.conversationId,
    };
  }

  @Query(() => ConversationStateResponse)
  async getConversationState(
    @Args('userId') userId: string,
    @Args('companyId') companyId: string,
  ): Promise<ConversationStateResponse> {
    const context = await this.conversations.getContext(userId, companyId);
    
    // Si hay stateMachine, usarlo; si no, convertir del legacy
    let stateMachine: ConversationStateMachine;
    if (context.stateMachine) {
      stateMachine = context.stateMachine;
    } else {
      // Convertir de legacy a nuevo formato
      const intent = context.lastIntention 
        ? this.stateMachine.mapLegacyIntention(context.lastIntention)
        : null;
      const state = this.stateMachine.mapLegacyState(context.stage, intent || undefined);
      
      stateMachine = {
        intent,
        state,
        fields: context.collectedData,
        metadata: {},
      };
    }

    return {
      intent: stateMachine.intent,
      state: stateMachine.state,
      fields: stateMachine.fields as any,
      metadata: JSON.stringify(stateMachine.metadata || {}),
    };
  }

  @Mutation(() => ConversationStateResponse)
  async resetConversation(
    @Args('userId') userId: string,
    @Args('companyId') companyId: string,
  ): Promise<ConversationStateResponse> {
    const resetState = this.stateMachine.resetState();
    
    // Guardar estado reseteado
    await this.conversations.saveContext(userId, companyId, {
      stage: 'idle',
      collectedData: {},
      conversationHistory: [],
      stateMachine: resetState,
    });

    return {
      intent: resetState.intent,
      state: resetState.state,
      fields: resetState.fields as any,
      metadata: JSON.stringify(resetState.metadata || {}),
    };
  }
}
